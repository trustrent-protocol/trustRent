#![no_std]

//! Decentralized arbitration voting contract.
//!
//! A panel of arbitrators votes on a deposit split for a disputed lease.
//! Once a quorum (majority) is reached the decision is final and emitted
//! as an event for the escrow contract to act on.

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Map, Vec,
};

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Panel,       // Vec<Address> — registered arbitrators
    Votes,       // Map<Address, (i128, i128)> — arbitrator -> (tenant_amt, landlord_amt)
    Decision,    // Option<(i128, i128)> — finalised split
    LeaseId,     // String — off-chain lease identifier
    Deposit,     // i128 — total deposit amount
}

#[contracttype]
#[derive(Clone, PartialEq)]
pub struct VoteTally {
    pub tenant_amount: i128,
    pub landlord_amount: i128,
    pub vote_count: u32,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ArbitrationContract;

#[contractimpl]
impl ArbitrationContract {
    /// Register the arbitration panel and the deposit amount under dispute.
    pub fn initialize(env: Env, panel: Vec<Address>, deposit: i128, lease_id: soroban_sdk::String) {
        if env.storage().instance().has(&DataKey::Panel) {
            panic!("already initialised");
        }
        assert!(panel.len() >= 3, "panel must have at least 3 arbitrators");
        env.storage().instance().set(&DataKey::Panel, &panel);
        env.storage().instance().set(&DataKey::Deposit, &deposit);
        env.storage().instance().set(&DataKey::LeaseId, &lease_id);
        env.storage().instance().set(&DataKey::Votes, &Map::<Address, (i128, i128)>::new(&env));
    }

    /// Cast a vote. Each arbitrator votes once with a proposed split.
    pub fn vote(env: Env, arbitrator: Address, tenant_amount: i128, landlord_amount: i128) {
        // Must not be decided yet
        if env.storage().instance().has(&DataKey::Decision) {
            panic!("decision already finalised");
        }

        arbitrator.require_auth();

        let panel: Vec<Address> = env.storage().instance().get(&DataKey::Panel).unwrap();
        assert!(panel.contains(&arbitrator), "not a panel member");

        let deposit: i128 = env.storage().instance().get(&DataKey::Deposit).unwrap();
        assert!(tenant_amount + landlord_amount == deposit, "amounts must sum to deposit");

        let mut votes: Map<Address, (i128, i128)> =
            env.storage().instance().get(&DataKey::Votes).unwrap();
        assert!(!votes.contains_key(arbitrator.clone()), "already voted");

        votes.set(arbitrator, (tenant_amount, landlord_amount));
        env.storage().instance().set(&DataKey::Votes, &votes);

        // Check for quorum (simple majority)
        let quorum = panel.len() / 2 + 1;
        if votes.len() >= quorum {
            Self::try_finalise(&env, &votes, quorum);
        }
    }

    /// Read the finalised decision, if any.
    pub fn decision(env: Env) -> Option<(i128, i128)> {
        env.storage().instance().get(&DataKey::Decision).unwrap_or(None)
    }

    /// Read current vote count.
    pub fn vote_count(env: Env) -> u32 {
        let votes: Map<Address, (i128, i128)> =
            env.storage().instance().get(&DataKey::Votes).unwrap_or(Map::new(&env));
        votes.len()
    }

    // ── private ───────────────────────────────────────────────────────────────

    fn try_finalise(env: &Env, votes: &Map<Address, (i128, i128)>, quorum: u32) {
        // Find the most common (tenant_amount, landlord_amount) pair
        let mut tally: Map<(i128, i128), u32> = Map::new(env);

        for (_, split) in votes.iter() {
            let count = tally.get(split.clone()).unwrap_or(0);
            tally.set(split, count + 1);
        }

        let mut best_split: Option<(i128, i128)> = None;
        let mut best_count = 0u32;

        for (split, count) in tally.iter() {
            if count > best_count {
                best_count = count;
                best_split = Some(split);
            }
        }

        if best_count >= quorum {
            let decision = best_split.unwrap();
            env.storage().instance().set(&DataKey::Decision, &Some(decision.clone()));
            // Decision emitted — off-chain indexer reads contract state
            let _ = decision;
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Env, String};

    fn setup_panel(env: &Env) -> (Vec<Address>, ArbitrationContractClient) {
        let a1 = Address::generate(env);
        let a2 = Address::generate(env);
        let a3 = Address::generate(env);
        let panel = vec![env, a1.clone(), a2.clone(), a3.clone()];

        let contract_id = env.register(ArbitrationContract, ());
        let client = ArbitrationContractClient::new(env, &contract_id);
        client.initialize(
            &panel,
            &1000_0000000,
            &String::from_str(env, "lease_abc123"),
        );
        (panel, client)
    }

    #[test]
    fn test_majority_vote_finalises_decision() {
        let env = Env::default();
        env.mock_all_auths();
        let (panel, client) = setup_panel(&env);

        // Two of three vote the same split → quorum reached
        client.vote(&panel.get(0).unwrap(), &800_0000000, &200_0000000);
        client.vote(&panel.get(1).unwrap(), &800_0000000, &200_0000000);

        let decision = client.decision();
        assert_eq!(decision, Some((800_0000000, 200_0000000)));
    }

    #[test]
    fn test_no_decision_before_quorum() {
        let env = Env::default();
        env.mock_all_auths();
        let (panel, client) = setup_panel(&env);

        client.vote(&panel.get(0).unwrap(), &800_0000000, &200_0000000);
        assert_eq!(client.decision(), None);
        assert_eq!(client.vote_count(), 1);
    }

    #[test]
    #[should_panic(expected = "already voted")]
    fn test_cannot_vote_twice() {
        let env = Env::default();
        env.mock_all_auths();
        let (panel, client) = setup_panel(&env);

        client.vote(&panel.get(0).unwrap(), &800_0000000, &200_0000000);
        client.vote(&panel.get(0).unwrap(), &800_0000000, &200_0000000);
    }

    #[test]
    #[should_panic(expected = "amounts must sum to deposit")]
    fn test_invalid_split_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let (panel, client) = setup_panel(&env);

        client.vote(&panel.get(0).unwrap(), &500_0000000, &200_0000000);
    }
}
