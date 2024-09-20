import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BurryEscrow } from "../target/types/burry_escrow";
import { Big } from "@switchboard-xyz/common";
import {
  AggregatorAccount,
  AnchorWallet,
  SwitchboardProgram,
} from "@switchboard-xyz/solana.js";

import { PublicKey, Commitment } from "@solana/web3.js";

import { Randomness, getProgramId, getDefaultQueue, AnchorUtils, asV0Tx } from "@switchboard-xyz/on-demand";
import { assert } from "chai";

export const solUSDSwitchboardFeed = new anchor.web3.PublicKey(
  "GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR",
);

const COMMITMENT = "confirmed";
const RANDOMNESS_SEED = "RANDOMNESS";
const ESCROW_SEED = "MICHAEL BURRY";

async function setupQueue(program: anchor.Program): Promise<PublicKey> {
  const queueAccount = await getDefaultQueue(
    program.provider.connection.rpcEndpoint
  );
  console.log("Queue account", queueAccount.pubkey.toString());
  try {
    await queueAccount.loadData();
  } catch (err) {
    console.error("Queue not found, ensure you are using devnet in your env");
    process.exit(1);
  }
  return queueAccount.pubkey;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("burry-escrow-randomness", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.AnchorProvider.env()
  const program = anchor.workspace.BurryEscrow as Program<BurryEscrow>;
  const payer = (provider.wallet as AnchorWallet).payer;

  it("Create Burry Escrow Above Price", async () => {
    // fetch switchboard devnet program object
    const switchboardProgram = await SwitchboardProgram.load(
      new anchor.web3.Connection("https://api.devnet.solana.com"),
      payer,
    );
    const aggregatorAccount = new AggregatorAccount(
      switchboardProgram,
      solUSDSwitchboardFeed,
    );

    // derive escrow state account
    const [escrowState] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("MICHAEL BURRY"), payer.publicKey.toBuffer()],
      program.programId,
    );
    console.log("Escrow Account: ", escrowState.toBase58());

    // fetch latest SOL price
    const solPrice: Big | null = await aggregatorAccount.fetchLatestValue();
    if (solPrice === null) {
      throw new Error("Aggregator holds no value");
    }
    const failUnlockPrice = solPrice.plus(10).toNumber();
    const amountToLockUp = new anchor.BN(100);

    // Send transaction
    try {
      const tx = await program.methods
        .deposit(amountToLockUp, failUnlockPrice)
        .accounts({
          user: payer.publicKey,
          escrowAccount: escrowState,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc();

      await provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Your transaction signature", tx);

      // Fetch the created account
      const newAccount = await program.account.escrowState.fetch(escrowState);

      const escrowBalance = await provider.connection.getBalance(
        escrowState,
        "confirmed",
      );
      console.log("Onchain unlock price:", newAccount.unlockPrice);
      console.log("Amount in escrow:", escrowBalance);

      // Check whether the data onchain is equal to local 'data'
      assert(failUnlockPrice == newAccount.unlockPrice);
      assert(escrowBalance > 0);
    } catch (e) {
      console.log(e);
      assert.fail(e);
    }
  });

  it("Attempt to withdraw while price is below UnlockPrice", async () => {
    let didFail = false;

    // derive escrow address
    const [escrowState] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("MICHAEL BURRY"), payer.publicKey.toBuffer()],
      program.programId,
    );

    // send tx
    try {
      const tx = await program.methods
        .withdraw()
        .accounts({
          user: payer.publicKey,
          escrowAccount: escrowState,
          feedAggregator: solUSDSwitchboardFeed,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc();

      await provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Your transaction signature", tx);
    } catch (e) {
      // verify tx returns expected error
      didFail = true;
      console.log(e.error.errorMessage);
      assert(
        e.error.errorMessage ==
        "Current SOL price is not above Escrow unlock price.",
      );
    }

    assert(didFail);
  });

  it("Roll till you can withdraw", async () => {
    const { connection, keypair, program: sbIdlprogram } = await AnchorUtils.loadEnv();

    // derive escrow address
    const [escrowState] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(ESCROW_SEED), payer.publicKey.toBuffer()],
      program.programId
    );

    // derive RandomnessState PDA
    const [randomnessState] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(RANDOMNESS_SEED), payer.publicKey.toBuffer()],
      program.programId
    );

    console.log("randomnessState: ", randomnessState.toBase58());

    // Get switchboard program id
    const sbProgramId = await getProgramId(provider.connection);
    const sbIdl = await anchor.Program.fetchIdl(sbProgramId, provider);
    const sbProgram = new anchor.Program(sbIdl!, provider);

    console.log("Switchboard program id", sbProgramId.toString());

    // setup queue
    let queue = await setupQueue(sbIdlprogram!);

    // Create Randomness account
    const randomnessKeypair = anchor.web3.Keypair.generate();
    const [randomness, createIx] = await Randomness.create(sbProgram, randomnessKeypair, queue);

    console.log("\nCreated randomness account..");
    console.log("Randomness account", randomness.pubkey.toString());

    const txOpts = {
      commitment: "processed" as Commitment,
      skipPreflight: false,
      maxRetries: 0,
    };

    const createRandomnessTx = await asV0Tx({
      connection: sbProgram.provider.connection,
      ixs: [createIx],
      payer: keypair.publicKey,
      signers: [keypair, randomnessKeypair],
      computeUnitPrice: 75_000,
      computeUnitLimitMultiple: 1.3,
    });

    const sim = await connection.simulateTransaction(createRandomnessTx, txOpts);
    const sig1 = await connection.sendTransaction(createRandomnessTx, txOpts);
    await connection.confirmTransaction(sig1, COMMITMENT);

    console.log(
      "  Transaction Signature for randomness account creation and requesting randomness: ",
      sig1
    );

    async function requestRandomnessAndTryToGetOutOfJail() {

      //Commit to randomness Ix
      console.log("\nCommit to randomness...");
      const commitIx = await randomness.commitIx(queue);

      // Create the requestRandomness instruction
      const requestRandomnessIx = await program.methods.requestRandomness(randomnessKeypair.publicKey)
        .accounts({
          user: payer.publicKey,
          escrowAccount: escrowState,
          randomnessState: randomnessState,
          randomnessAccount: randomnessKeypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();

      const commitAndRequestRandomnessTx = await asV0Tx({
        connection: sbProgram.provider.connection,
        ixs: [commitIx, requestRandomnessIx],
        payer: keypair.publicKey,
        signers: [keypair, payer],
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
      });

      const sim2 = await connection.simulateTransaction(commitAndRequestRandomnessTx, txOpts);
      const sig2 = await connection.sendTransaction(commitAndRequestRandomnessTx, txOpts);
      await connection.confirmTransaction(sig2, COMMITMENT);

      // Wait for the committed slot to pass
      await delay(5000);

      // reveal randomness instruction
      const revealIx = await randomness.revealIx();

      // Reveal randomness
      const getOutOfJailIx = await program.methods.getOutOfJail()
        .accounts({
          user: payer.publicKey,
          escrowAccount: escrowState,
          randomnessState: randomnessState,
          randomnessAccount: randomnessKeypair.publicKey,
        }).instruction();

      const revealRandomnessAndGetOutOfJailTx = await asV0Tx({
        connection: sbProgram.provider.connection,
        ixs: [revealIx, getOutOfJailIx],
        payer: keypair.publicKey,
        signers: [keypair, payer],
        computeUnitPrice: 75_000,
        computeUnitLimitMultiple: 1.3,
      });

      const sim3 = await connection.simulateTransaction(revealRandomnessAndGetOutOfJailTx, txOpts);
      const sig3 = await connection.sendTransaction(revealRandomnessAndGetOutOfJailTx, txOpts);
      await connection.confirmTransaction(sig3, COMMITMENT);

      console.log('Get out of jail transaction signature:', sig3);
    }

    let rolledDoubles = false;
    while (!rolledDoubles) {
      try {
        // Request randomness
        await requestRandomnessAndTryToGetOutOfJail();

        // Check dice roll results

        const randomnessStateAccount = await program.account.randomnessState.fetch(randomnessState);
        console.log("Die 1:", randomnessStateAccount.dieResult1);
        console.log("Die 2:", randomnessStateAccount.dieResult2);

        if (randomnessStateAccount.dieResult1 === randomnessStateAccount.dieResult2) {
          rolledDoubles = true;
          console.log("Rolled doubles!");
        } else {
          console.log("No doubles. Trying again...");
          await delay(5000);
        }

      } catch (e) {
        console.log(e);
        assert.fail(e);
      }
    }

    // Attempt to withdraw
    try {
      const tx = await program.methods.withdraw()
        .accounts({
          user: payer.publicKey,
          escrowAccount: escrowState,
          feedAggregator: solUSDSwitchboardFeed,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc();

      await provider.connection.confirmTransaction(tx, "confirmed");
      console.log("Withdrawal successful");
    } catch (e) {
      console.log(e);
      assert.fail("Withdrawal should have succeeded after rolling doubles");
    }


  });

});