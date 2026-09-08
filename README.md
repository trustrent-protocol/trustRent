<div align="center">

<img src="https://img.shields.io/badge/Built%20on-Stellar-7F77DD?style=for-the-badge&logo=stellar&logoColor=white" />
<img src="https://img.shields.io/badge/License-MIT-1D9E75?style=for-the-badge" />
<img src="https://img.shields.io/badge/Status-In%20Development-F0992B?style=for-the-badge" />
<img src="https://img.shields.io/badge/Open%20Source-Yes-1D9E75?style=for-the-badge" />

# trustRent

**Transparent, programmable rental payments on the Stellar blockchain.**

trustRent connects landlords, agents, and tenants through verifiable on-chain agreements, low-cost stablecoin payments, and escrow-protected deposits — built for emerging markets where trust is scarce and fees are high.

[Overview](#overview) · [Architecture](#architecture) · [How It Works](#how-it-works) · [Getting Started](#getting-started) · [Smart Contracts](#smart-contracts) · [API Reference](#api-reference) · [Contributing](#contributing)

---

</div>

## Overview

Rental markets in emerging economies face a common set of problems:

- **Disputes** over deposit returns with no verifiable payment history
- **High fees** from bank transfers, agents, and currency conversion
- **Slow settlement** — cross-border rent payments can take days
- **No transparency** — tenants have no on-chain proof of payment; landlords have no automated enforcement

trustRent solves these by doing what blockchains do best: **moving money cheaply, creating verifiable records, and enforcing agreements without intermediaries** — while keeping complex business logic off-chain for usability.

Built on **Stellar**, trustRent inherits:

| Property | Value |
|---|---|
| Settlement time | ~5 seconds |
| Average transaction fee | < $0.01 USD |
| Native stablecoin support | USDC, EURC, and custom anchored assets |
| Built-in DEX | Instant on-chain currency swaps |
| Decentralized | No single point of failure or control |

---

## Architecture

trustRent follows a deliberate **on-chain / off-chain split**. Not everything belongs on a blockchain.

```
┌─────────────────────────────────────────────────────────────┐
│                        OFF-CHAIN                            │
│                                                             │
│   ┌─────────────┐   ┌──────────────┐   ┌───────────────┐  │
│   │  Lease PDF  │   │  e-Signature │   │  Property DB  │  │
│   │  Agreement  │   │   Service    │   │  & Listings   │  │
│   └──────┬──────┘   └──────┬───────┘   └───────┬───────┘  │
│          └─────────────────┴───────────────────┘           │
│                            │                                │
│                  Agreement Hash (SHA-256)                   │
└────────────────────────────┼────────────────────────────────┘
                             │ anchored
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                        ON-CHAIN (Stellar)                   │
│                                                             │
│   ┌──────────────────────────────────────────────────────┐  │
│   │               Escrow Account                        │  │
│   │   - Deposit held in USDC                            │  │
│   │   - Multi-sig: tenant + landlord + arbitrator       │  │
│   │   - Clawback on verified damage claim               │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                             │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│   │  Monthly     │   │  Agent Fee   │   │  Payment     │  │
│   │  Rent (USDC) │──▶│  Auto-split  │──▶│  Receipt     │  │
│   │              │   │              │   │  on Ledger   │  │
│   └──────────────┘   └──────────────┘   └──────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

**1. Money on-chain. Logic off-chain.**
Stellar handles what it's best at: value transfer, escrow, and immutable records. Business logic (listing management, KYC, notifications, dispute UI) stays in off-chain services for scale and flexibility.

**2. Trust minimization.**
No party needs to trust another — the escrow contract enforces deposit rules, payment receipts are verifiable by anyone, and agreement hashes are immutable.

**3. Emerging market first.**
Designed for USDC-denominated payments that protect against local currency volatility. Low fees ($0.01/tx) make micro-payments and weekly rent schedules viable.

**4. Open and extensible.**
The Stellar SDK is available in JavaScript, Python, Go, Java, and Rust. Any developer can build tooling, integrations, or alternative frontends on the same protocol.

---

## How It Works

### The Three Roles

| Role | Responsibilities | On-chain actions |
|---|---|---|
| **Landlord** | Lists property, sets rent amount and terms | Creates escrow account, receives rent, initiates deposit release |
| **Agent** (optional) | Manages listing, coordinates viewings | Receives auto-split commission on each rent payment |
| **Tenant** | Pays rent, locks deposit | Sends monthly payment, recovers deposit on lease-end |

---

### Payment Flow

#### Step 1 — Lease Agreement (off-chain)

Tenant and landlord agree on terms via the trustRent app or any off-chain channel. The final lease document is hashed (SHA-256) and the hash is written to the Stellar ledger via a `MANAGE_DATA` operation. Neither party can later dispute the agreed terms — the hash is permanent and timestamped.

```bash
# Example: anchoring a lease hash to Stellar
stellar tx submit --operation manage_data \
  --name "trustrent:lease:2026-05" \
  --value "sha256:4f2a9c...c891"
```

#### Step 2 — Deposit Locked in Escrow (on-chain)

Tenant sends the deposit to a Stellar escrow account controlled by a **3-of-3 multi-signature**: tenant, landlord, and a neutral arbitrator (initially trustRent; roadmap includes decentralized arbitration).

```js
// trustRent SDK — lock deposit
const escrow = await trustRent.createEscrow({
  tenant: "GDKX...T7N2",
  landlord: "GBML...R4KP",
  arbitrator: "GCTR...W9QA",
  amount: "1800",
  asset: Asset.USDC,
  leaseHash: "4f2a9c...c891",
  leaseDurationMonths: 12,
});
```

The deposit cannot be moved without 2-of-3 signatures. Landlords cannot abscond; tenants cannot skip out without consequence.

#### Step 3 — Monthly Rent Payment (on-chain)

On (or before) the rent due date, the tenant sends a Stellar payment. If an agent is registered on the lease, the trustRent backend submits a batched transaction that splits the payment automatically using Stellar's native multi-payment operations.

```
Tenant sends 500 USDC
  ├── 465 USDC → Landlord  (93%)
  └──  35 USDC → Agent     (7%)
```

Both parties receive a Stellar transaction hash as cryptographic proof of payment — no more "the bank says it went through" ambiguity.

#### Step 4 — Receipt History (on-chain)

Every payment is permanently recorded on the Stellar ledger. trustRent indexes these events and presents them as a human-readable payment history. This receipt trail is accessible to:

- Tenants (proof of payment, rental history for credit applications)
- Landlords (income verification)
- Third parties with tenant consent (lenders, future landlords)

#### Step 5 — Lease End & Deposit Return (on-chain)

On lease-end, one of three outcomes:

```
┌─────────────────────────────────────────────────────────────┐
│  OUTCOME A — Clean exit (default)                           │
│  Landlord + tenant both sign → deposit returns to tenant    │
├─────────────────────────────────────────────────────────────┤
│  OUTCOME B — Partial deduction (agreed)                     │
│  Both parties sign a split: e.g. 80% tenant / 20% landlord  │
├─────────────────────────────────────────────────────────────┤
│  OUTCOME C — Dispute                                        │
│  Arbitrator reviews evidence → co-signs release decision    │
│  Clawback feature used if damage proven                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- A Stellar account (testnet or mainnet)
- USDC balance (testnet: use [Stellar Laboratory](https://laboratory.stellar.org) faucet)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/trustrent.git
cd trustrent

# Install dependencies
npm install

# Copy environment config
cp .env.example .env
```

### Environment Configuration

```env
# .env

# Stellar network — "testnet" or "mainnet"
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

# trustRent arbitrator account (defaults to testnet arbitrator)
ARBITRATOR_PUBLIC_KEY=GCTR...W9QA
ARBITRATOR_SECRET_KEY=S...

# Backend database (PostgreSQL recommended)
DATABASE_URL=postgresql://user:pass@localhost:5432/trustrent

# Off-chain signing service
SIGNING_SERVICE_URL=http://localhost:3001

# Notification webhook (optional)
WEBHOOK_URL=https://your-app.com/webhooks/trustrent
```

### Running Locally

```bash
# Run database migrations
npm run migrate

# Start the API server
npm run dev

# Run the Stellar event indexer (watches on-chain payment events)
npm run indexer

# Run tests
npm test

# Run tests against testnet
npm run test:testnet
```

---

## Smart Contracts

trustRent uses **Stellar's native primitives** for the current production escrow, with **Soroban smart contracts** implemented and tested for the v0.4 migration.

### Native Escrow (current)

The production escrow logic is enforced by multi-signature account configuration (`src/stellar/escrow.js`).

### Escrow Account Structure

```
Escrow Account
  ├── Signers
  │     ├── Tenant public key         (weight: 1)
  │     ├── Landlord public key       (weight: 1)
  │     └── Arbitrator public key     (weight: 1)
  ├── Thresholds
  │     ├── Low:    1  (balance check)
  │     ├── Medium: 2  (payment)
  │     └── High:   2  (account merge / full release)
  └── Data Entries
        ├── trustrent:lease           (lease SHA-256 hash)
        ├── trustrent:tenant          (tenant public key)
        ├── trustrent:landlord        (landlord public key)
        └── trustrent:lease:expires   (Unix timestamp)
```

### Key Stellar Operations Used

| Operation | Purpose |
|---|---|
| `CREATE_ACCOUNT` | Provision new escrow account |
| `SET_OPTIONS` | Configure multi-sig weights and thresholds |
| `MANAGE_DATA` | Anchor lease hash, store metadata |
| `PAYMENT` | Send rent, split agent commissions |
| `ACCOUNT_MERGE` | Release escrow at lease-end |
| `CLAWBACK` | Landlord reclaims deposit on proven damage |

### Soroban Contracts (implemented, v0.4 migration)

The `contracts/` directory contains Soroban smart contract implementations for:

- Escrow deposit lifecycle (release, split, dispute, arbitrate, clawback) — **✅ implemented & tested**
- Decentralized arbitration voting (panel quorum) — **✅ implemented & tested**
- Automated late-fee calculation — planned
- Scheduled recurring payments — planned

See [`contracts/README.md`](./contracts/README.md) for current status.

---

## API Reference

trustRent exposes a REST API for frontend applications and third-party integrations.

### Leases

```http
POST   /api/v1/leases              Create a new lease
GET    /api/v1/leases/:id          Get lease details
PATCH  /api/v1/leases/:id          Update lease status
DELETE /api/v1/leases/:id          Cancel lease (pre-activation only)
```

### Escrow

```http
POST   /api/v1/escrow              Create escrow account for a lease
GET    /api/v1/escrow/:leaseId     Get escrow account status
POST   /api/v1/escrow/:leaseId/release    Initiate deposit release
POST   /api/v1/escrow/:leaseId/dispute    Open a dispute
```

### Payments

```http
POST   /api/v1/payments            Submit a rent payment
GET    /api/v1/payments/:leaseId   Get full payment history for a lease
GET    /api/v1/payments/receipt/:txHash    Get a single payment receipt
```

### Example: Submit a Rent Payment

```http
POST /api/v1/payments
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "leaseId": "lease_8f2a...",
  "amount": "500.00",
  "asset": "USDC",
  "memo": "Rent May 2026"
}
```

```json
// 201 Created
{
  "id": "pay_4f2a9c891",
  "status": "confirmed",
  "txHash": "4f2a9c...c891",
  "ledger": 50234891,
  "settledAt": "2026-05-01T08:12:34Z",
  "splits": [
    { "recipient": "landlord", "amount": "465.00", "asset": "USDC" },
    { "recipient": "agent",    "amount":  "35.00", "asset": "USDC" }
  ]
}
```

Full API documentation: [`docs/api.md`](./docs/api.md)

---

## Project Structure

```
trustrent/
├── src/
│   ├── api/              # Express REST API
│   │   ├── routes/       # leases, payments, escrow, users
│   │   └── middleware/   # auth, validation, rate-limiting
│   ├── stellar/          # Stellar SDK wrappers
│   │   ├── escrow.js     # Escrow account creation & management
│   │   ├── payments.js   # Payment submission & splitting
│   │   └── indexer.js    # On-chain event listener
│   ├── services/         # Off-chain business logic
│   │   ├── lease.js
│   │   ├── dispute.js
│   │   └── notifications.js
│   └── db/               # PostgreSQL models & migrations
│       ├── models/
│       └── migrations/
├── contracts/            # Soroban smart contracts
│   ├── escrow/           # Deposit lifecycle contract (✅ implemented)
│   └── arbitration/      # Panel voting contract (✅ implemented)
├── docs/                 # Extended documentation
│   ├── api.md
│   ├── architecture.md
│   └── emerging-markets.md
├── tests/
│   ├── unit/
│   └── integration/
├── CONTRIBUTING.md
├── CHANGELOG.md
└── SECURITY.md
```

---

## Security

trustRent handles real money. Security is non-negotiable.

### Threat Model

| Threat | Mitigation |
|---|---|
| Landlord withholds deposit | Funds locked in multi-sig escrow; requires 2-of-3 to release |
| Tenant disputes all charges | Arbitrator co-signature required; evidence documented off-chain |
| Replay attacks | Stellar sequence numbers prevent replay by design |
| Secret key compromise | Escrow accounts use multi-sig; single key compromise is non-fatal |
| API key theft | JWT with short expiry + refresh tokens; signing keys never leave server |

### Responsible Disclosure

Found a security vulnerability? Please **do not** open a public GitHub issue.

Email: `security@trustrent.xyz`
PGP Key: published on release tags and `hkps://keys.openpgp.org` (uid `security@trustrent.xyz`)

We aim to acknowledge reports within 24 hours and patch critical issues within 72 hours.

---

## Roadmap

### v0.1 — Foundation ✅ *(current)*
- [x] Escrow account creation and management
- [x] USDC rent payments with agent fee splitting
- [x] Lease hash anchoring on Stellar
- [x] Payment history indexer
- [x] REST API (leases, payments, escrow)

### v0.2 — Deposit Lifecycle
- [ ] Tenant-initiated deposit recovery flow
- [ ] Landlord-initiated partial deduction
- [ ] Dispute opening and resolution UI
- [ ] Email and webhook notifications

### v0.3 — Stablecoin Flexibility
- [ ] Multi-asset support (EURC, local anchored assets)
- [ ] On-chain DEX integration for currency conversion at payment time
- [ ] Tenant pays in local currency → landlord receives USDC

### v0.4 — Soroban Contracts
- [x] Soroban escrow contract (release, split, dispute, arbitrate, clawback)
- [x] Decentralized arbitration voting (panel quorum)
- [ ] Automated late-fee calculation
- [ ] Scheduled recurring payments

### v1.0 — Production
- [ ] Mobile SDK (React Native)
- [ ] WhatsApp / USSD payment interface for feature-phone access
- [ ] Formal security audit
- [ ] Mainnet launch

---

## Contributing

trustRent is open source and contributions are welcome. We especially welcome contributors with knowledge of:

- Stellar SDK and Soroban smart contracts
- Emerging market payment systems (M-Pesa, mobile money, local stablecoins)
- Frontend development (React, React Native)
- Security engineering

### How to Contribute

```bash
# Fork and clone
git clone https://github.com/your-username/trustrent.git

# Create a feature branch
git checkout -b feat/your-feature-name

# Make changes, add tests
npm test

# Push and open a pull request
git push origin feat/your-feature-name
```

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for code style guidelines, commit conventions, and the pull request process.

### Development Standards

- All monetary values stored and transmitted as strings (never floats)
- Every Stellar operation must be tested against testnet before merge
- No external dependencies with access to private keys
- All API endpoints must have integration tests

---

## Acknowledgements

- [Stellar Development Foundation](https://stellar.org) — for building infrastructure that makes this possible
- [Circle](https://circle.com) — for USDC on Stellar
- The emerging market fintech community whose users this is built for

---

## License

trustRent is released under the [MIT License](./LICENSE).

```
MIT License

Copyright (c) 2026 trustRent Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

<div align="center">

Built with purpose for renters and landlords in emerging markets.

**[trustRent](https://trustrent.xyz)** · [Docs](https://docs.trustrent.xyz) · [Discord](https://discord.gg/trustrent) · [Twitter](https://twitter.com/trustrent_xyz)

</div>
