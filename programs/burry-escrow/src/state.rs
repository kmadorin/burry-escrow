use anchor_lang::prelude::*;

pub const ESCROW_SEED: &[u8] = b"MICHAEL BURRY";
pub const RANDOMNESS_SEED: &[u8] = b"RANDOMNESS";
pub const SOL_USDC_FEED: &str = "GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR";

#[account]
pub struct EscrowState {
    pub unlock_price: f64,
    pub escrow_amount: u64,
    pub out_of_jail: bool,
}

#[account]
pub struct RandomnessState {
    pub bump: u8,
    pub randomness_account: Pubkey,
    pub dice_type: u8,
    pub die_result_1: u8,
    pub die_result_2: u8,
    pub roll_count: u8,
    pub escrow: Pubkey,
}
