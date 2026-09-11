# Changelog

All notable changes to trustRent are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- Automated late-fee calculation: exact integer math, lease-level config
  (`rent_due_day`, `late_fee_daily_pct`, `late_fee_grace_days`), applied to
  rent payments and surfaced in the payment receipt
- Recurring rent schedule service and `GET /payments/:leaseId/schedule`
  endpoint (per-period due dates, paid/overdue status, exact totals)

## [0.1.0] — 2026-05-12

### Added
- PostgreSQL schema: users, leases, payments
- Stellar escrow account creation with 2-of-3 multi-sig
- USDC rent payments with automatic agent fee splitting
- On-chain payment event indexer
- REST API: leases, escrow, payments, users (JWT auth)
- Off-chain services: lease hashing, dispute stub, notifications stub
- Soroban escrow contract: full deposit lifecycle (release, split, dispute, arbitrate, clawback)
- Soroban arbitration contract: decentralized panel voting with quorum
- Unit tests: lease hashing, payment splitting
- Integration test stubs for testnet
