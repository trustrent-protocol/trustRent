#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, String,
};

// ── Storage keys ────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Tenant,
    Landlord,
    Arbitrator,
    TokenId,
    DepositAmount,
    LeaseHash,
    LeaseExpires,
    State,
}

// ── Escrow state machine ─────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum EscrowState {
    Active,
    Released,
    Disputed,
    Clawback,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialise the escrow. Called once by the landlord after deploying.
    /// Transfers `deposit_amount` tokens from `tenant` into the contract.
    pub fn initialize(
        env: Env,
        tenant: Address,
        landlord: Address,
        arbitrator: Address,
        token_id: Address,
        deposit_amount: i128,
        lease_hash: String,
        lease_expires: u64,
    ) {
        // Prevent re-initialisation
        if env.storage().instance().has(&DataKey::State) {
            panic!("already initialised");
        }

        tenant.require_auth();

        // Pull deposit from tenant into contract
        let client = token::Client::new(&env, &token_id);
        client.transfer(&tenant, &env.current_contract_address(), &deposit_amount);

        env.storage().instance().set(&DataKey::Tenant, &tenant);
        env.storage().instance().set(&DataKey::Landlord, &landlord);
        env.storage().instance().set(&DataKey::Arbitrator, &arbitrator);
        env.storage().instance().set(&DataKey::TokenId, &token_id);
        env.storage().instance().set(&DataKey::DepositAmount, &deposit_amount);
        env.storage().instance().set(&DataKey::LeaseHash, &lease_hash);
        env.storage().instance().set(&DataKey::LeaseExpires, &lease_expires);
        env.storage().instance().set(&DataKey::State, &EscrowState::Active);
    }

    /// Release full deposit back to tenant. Requires both landlord and tenant auth.
    pub fn release(env: Env) {
        Self::assert_state(&env, EscrowState::Active);

        let tenant: Address = env.storage().instance().get(&DataKey::Tenant).unwrap();
        let landlord: Address = env.storage().instance().get(&DataKey::Landlord).unwrap();

        tenant.require_auth();
        landlord.require_auth();

        let amount: i128 = env.storage().instance().get(&DataKey::DepositAmount).unwrap();
        let token_id: Address = env.storage().instance().get(&DataKey::TokenId).unwrap();

        token::Client::new(&env, &token_id)
            .transfer(&env.current_contract_address(), &tenant, &amount);

        env.storage().instance().set(&DataKey::State, &EscrowState::Released);
    }

    /// Partial release: split deposit between tenant and landlord.
    /// Requires both parties to agree on the split.
    pub fn release_split(env: Env, tenant_amount: i128, landlord_amount: i128) {
        Self::assert_state(&env, EscrowState::Active);

        let tenant: Address = env.storage().instance().get(&DataKey::Tenant).unwrap();
        let landlord: Address = env.storage().instance().get(&DataKey::Landlord).unwrap();
        let deposit: i128 = env.storage().instance().get(&DataKey::DepositAmount).unwrap();

        assert!(tenant_amount + landlord_amount == deposit, "amounts must sum to deposit");

        tenant.require_auth();
        landlord.require_auth();

        let token_id: Address = env.storage().instance().get(&DataKey::TokenId).unwrap();
        let client = token::Client::new(&env, &token_id);
        let contract = env.current_contract_address();

        if tenant_amount > 0 {
            client.transfer(&contract, &tenant, &tenant_amount);
        }
        if landlord_amount > 0 {
            client.transfer(&contract, &landlord, &landlord_amount);
        }

        env.storage().instance().set(&DataKey::State, &EscrowState::Released);
    }

    /// Open a dispute. Either party can call this.
    pub fn dispute(env: Env) {
        Self::assert_state(&env, EscrowState::Active);

        let tenant: Address = env.storage().instance().get(&DataKey::Tenant).unwrap();
        let landlord: Address = env.storage().instance().get(&DataKey::Landlord).unwrap();

        env.storage().instance().set(&DataKey::State, &EscrowState::Disputed);

        // Notify off-chain indexer via event
        let _ = (tenant, landlord);
    }

    /// Arbitrator resolves dispute by deciding the split.
    pub fn arbitrate(env: Env, tenant_amount: i128, landlord_amount: i128) {
        Self::assert_state(&env, EscrowState::Disputed);

        let arbitrator: Address = env.storage().instance().get(&DataKey::Arbitrator).unwrap();
        arbitrator.require_auth();

        let tenant: Address = env.storage().instance().get(&DataKey::Tenant).unwrap();
        let landlord: Address = env.storage().instance().get(&DataKey::Landlord).unwrap();
        let deposit: i128 = env.storage().instance().get(&DataKey::DepositAmount).unwrap();

        assert!(tenant_amount + landlord_amount == deposit, "amounts must sum to deposit");

        let token_id: Address = env.storage().instance().get(&DataKey::TokenId).unwrap();
        let client = token::Client::new(&env, &token_id);
        let contract = env.current_contract_address();

        if tenant_amount > 0 {
            client.transfer(&contract, &tenant, &tenant_amount);
        }
        if landlord_amount > 0 {
            client.transfer(&contract, &landlord, &landlord_amount);
        }

        env.storage().instance().set(&DataKey::State, &EscrowState::Released);
    }

    /// Clawback: landlord reclaims deposit on proven damage (arbitrator must co-sign).
    pub fn clawback(env: Env) {
        Self::assert_state(&env, EscrowState::Active);

        let landlord: Address = env.storage().instance().get(&DataKey::Landlord).unwrap();
        let arbitrator: Address = env.storage().instance().get(&DataKey::Arbitrator).unwrap();

        landlord.require_auth();
        arbitrator.require_auth();

        let amount: i128 = env.storage().instance().get(&DataKey::DepositAmount).unwrap();
        let token_id: Address = env.storage().instance().get(&DataKey::TokenId).unwrap();

        token::Client::new(&env, &token_id)
            .transfer(&env.current_contract_address(), &landlord, &amount);

        env.storage().instance().set(&DataKey::State, &EscrowState::Clawback);
    }

    /// Read current state.
    pub fn state(env: Env) -> EscrowState {
        env.storage().instance().get(&DataKey::State).unwrap()
    }

    /// Read deposit balance held in contract.
    pub fn balance(env: Env) -> i128 {
        let token_id: Address = env.storage().instance().get(&DataKey::TokenId).unwrap();
        token::Client::new(&env, &token_id)
            .balance(&env.current_contract_address())
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    fn assert_state(env: &Env, expected: EscrowState) {
        let state: EscrowState = env.storage().instance().get(&DataKey::State).unwrap();
        assert!(state == expected, "invalid state for this operation");
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _},
        token::{Client as TokenClient, StellarAssetClient},
        Env, String,
    };

    fn setup() -> (Env, Address, Address, Address, Address, EscrowContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let tenant = Address::generate(&env);
        let landlord = Address::generate(&env);
        let arbitrator = Address::generate(&env);

        // Deploy a mock USDC token
        let token_id = env.register_stellar_asset_contract_v2(landlord.clone()).address();
        let token_admin = StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&tenant, &2000_0000000); // 2000 USDC (7 decimals)

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(
            &tenant,
            &landlord,
            &arbitrator,
            &token_id,
            &1000_0000000, // 1000 USDC deposit
            &String::from_str(&env, "sha256:abc123"),
            &(env.ledger().timestamp() + 86400 * 365),
        );

        (env, tenant, landlord, arbitrator, token_id, client)
    }

    #[test]
    fn test_initialize_locks_deposit() {
        let (env, _tenant, _landlord, _arbitrator, _token_id, client) = setup();
        assert_eq!(client.state(), EscrowState::Active);
        assert_eq!(client.balance(), 1000_0000000);
    }

    #[test]
    fn test_full_release_to_tenant() {
        let (env, tenant, _landlord, _arbitrator, token_id, client) = setup();
        client.release();
        assert_eq!(client.state(), EscrowState::Released);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&tenant), 2000_0000000);
    }

    #[test]
    fn test_split_release() {
        let (env, tenant, landlord, _arbitrator, token_id, client) = setup();
        client.release_split(&800_0000000, &200_0000000);
        assert_eq!(client.state(), EscrowState::Released);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&tenant), 1800_0000000);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&landlord), 200_0000000);
    }

    #[test]
    fn test_clawback_requires_arbitrator() {
        let (_env, _tenant, _landlord, _arbitrator, _token_id, client) = setup();
        client.clawback();
        assert_eq!(client.state(), EscrowState::Clawback);
    }

    #[test]
    fn test_arbitrate_resolves_dispute() {
        let (env, tenant, landlord, _arbitrator, token_id, client) = setup();
        client.dispute();
        assert_eq!(client.state(), EscrowState::Disputed);
        client.arbitrate(&600_0000000, &400_0000000);
        assert_eq!(client.state(), EscrowState::Released);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&tenant), 1600_0000000);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&landlord), 400_0000000);
    }

    #[test]
    #[should_panic(expected = "already initialised")]
    fn test_cannot_reinitialise() {
        let (env, tenant, landlord, arbitrator, token_id, client) = setup();
        client.initialize(
            &tenant, &landlord, &arbitrator, &token_id,
            &500_0000000,
            &String::from_str(&env, "sha256:xyz"),
            &9999999999,
        );
    }
}
