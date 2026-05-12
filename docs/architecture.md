# Architecture

## On-chain / Off-chain Split

trustRent deliberately keeps business logic off-chain and only puts money movement and proof on-chain.

**On-chain (Stellar):**
- Deposit escrow (multi-sig account)
- Rent payments (USDC)
- Agent fee splits
- Lease hash anchoring (MANAGE_DATA)
- Payment receipts (transaction hashes)

**Off-chain (PostgreSQL + Express):**
- User accounts and KYC
- Lease metadata and status
- Payment history index
- Dispute evidence
- Notifications

## Escrow Design

The escrow account uses Stellar's native multi-signature with weights:
- Tenant: 1, Landlord: 1, Arbitrator: 1
- Medium/High threshold: 2 (requires any 2-of-3)
- Master key weight: 0 (disabled — no single party controls the account)

## Indexer

The indexer (`src/stellar/indexer.js`) streams payment events from Horizon for all active escrow accounts and writes confirmed payments to PostgreSQL. This provides a queryable payment history without requiring clients to query Horizon directly.
