use crate::state::*;
use crate::errors::*;
use anchor_lang::prelude::*;
use switchboard_on_demand::RandomnessAccountData;

pub fn request_randomness_handler(ctx: Context<RequestRandomness>, randomness_account: Pubkey) -> Result<()> {
    let clock = Clock::get()?;

    // Parse the randomness account data
    let randomness_data = RandomnessAccountData::parse(ctx.accounts.randomness_account.data.borrow()).unwrap();
    
    // Check if the randomness has already been revealed
    if randomness_data.seed_slot != clock.slot - 1 {
        msg!("seed_slot: {}", randomness_data.seed_slot);
        msg!("slot: {}", clock.slot);
        return Err(EscrowErrorCode::RandomnessAlreadyRevealed.into());
    }

    // Update the RandomnessState
    let randomness_state = &mut ctx.accounts.randomness_state;
    randomness_state.randomness_account = randomness_account;

    Ok(())
}

#[derive(Accounts)]
pub struct RequestRandomness<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<RandomnessState>(),
        seeds = [RANDOMNESS_SEED, user.key().as_ref()],
        bump
    )]
    pub randomness_state: Account<'info, RandomnessState>,
    /// CHECK: This account is validated by Switchboard's on-demand randomness program
    pub randomness_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}