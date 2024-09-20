use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitRandomnessState<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, user.key().as_ref()],
        bump,
    )]
    pub escrow_account: Account<'info, EscrowState>,
    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<RandomnessState>(),
        seeds = [RANDOMNESS_SEED, user.key().as_ref()],
        bump
    )]
    pub randomness_state: Account<'info, RandomnessState>,
    pub system_program: Program<'info, System>,
}

pub fn init_randomness_state_handler(ctx: Context<InitRandomnessState>) -> Result<()> {
    let randomness_state = &mut ctx.accounts.randomness_state;
    randomness_state.dice_type = 6; // Set the dice type to 6-sided dice
    randomness_state.die_result_1 = 0; // Initialize dice results
    randomness_state.die_result_2 = 0;
    randomness_state.escrow = ctx.accounts.escrow_account.key();
    randomness_state.randomness_account = Pubkey::default(); // Will be set later during request_randomness
    Ok(())
}