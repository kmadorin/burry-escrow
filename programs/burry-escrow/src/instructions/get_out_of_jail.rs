use crate::state::*;
use crate::errors::*;
use anchor_lang::prelude::*;
use switchboard_on_demand::RandomnessAccountData;

pub fn get_out_of_jail_handler(ctx: Context<GetOutOfJail>) -> Result<()> {
    let clock = Clock::get()?;

    // Parse the randomness account data
    let randomness_data = RandomnessAccountData::parse(ctx.accounts.randomness_account.data.borrow()).unwrap();
    
    // Get the revealed random value
    let revealed_random_value = randomness_data.get_value(&clock)
        .map_err(|_| error!(EscrowErrorCode::RandomnessNotResolved))?;

    // Update the RandomnessState
    let randomness_state = &mut ctx.accounts.randomness_state;
    let dice_type = randomness_state.dice_type;

    randomness_state.die_result_1 = (revealed_random_value[0] % dice_type) + 1;
    randomness_state.die_result_2 = (revealed_random_value[1] % dice_type) + 1;

    // SOLUTION EDIT: Ticked up roll count and checked if over 3
    randomness_state.roll_count = randomness_state.roll_count.saturating_add(1);
    if randomness_state.roll_count >= 3 {
        msg!("Three rolls and you're out of jail!");
        let escrow_state = &mut ctx.accounts.escrow_account;
        escrow_state.out_of_jail = true;
    }

    // Check if doubles were rolled
    if randomness_state.die_result_1 == randomness_state.die_result_2 {
        // Update the EscrowState
        let escrow_state = &mut ctx.accounts.escrow_account;
        escrow_state.out_of_jail = true;
    }

    msg!("Dice roll results: {} and {}", randomness_state.die_result_1, randomness_state.die_result_2);

    Ok(())
}

#[derive(Accounts)]
pub struct GetOutOfJail<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, user.key().as_ref()],
        bump,
    )]
    pub escrow_account: Account<'info, EscrowState>,
    #[account(
        mut,
        seeds = [RANDOMNESS_SEED, user.key().as_ref()],
        bump,
    )]
    pub randomness_state: Account<'info, RandomnessState>,
    /// CHECK: This account is validated by Switchboard's on-demand randomness program
    pub randomness_account: AccountInfo<'info>,
}