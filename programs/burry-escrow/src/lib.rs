use anchor_lang::prelude::*;
use instructions::deposit::*;
use instructions::withdraw::*;
use instructions::get_out_of_jail::*;
use instructions::request_randomness::*;

pub mod errors;
pub mod instructions;
pub mod state;

declare_id!("DXkUUYVwGG2fxswCtarxNqFG3d6CQEKB24cEiNAiigB3");

#[program]
pub mod burry_escrow {
    use super::*;

    pub fn deposit(ctx: Context<Deposit>, escrow_amt: u64, unlock_price: f64) -> Result<()> {
        deposit_handler(ctx, escrow_amt, unlock_price)
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        withdraw_handler(ctx)
    }

    pub fn get_out_of_jail(ctx: Context<GetOutOfJail>) -> Result<()>{
        get_out_of_jail_handler(ctx)
    }

    pub fn request_randomness(ctx: Context<RequestRandomness>, randomness_account: Pubkey) -> Result<()> {
        request_randomness_handler(ctx, randomness_account)
    }
}
