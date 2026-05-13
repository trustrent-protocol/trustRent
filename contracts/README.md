# Soroban Contracts

Soroban smart contract implementations for trustRent (v0.4 track).

## Contracts

### `escrow/`

Replaces the native multi-sig escrow with a programmable Soroban contract.

| Function | Description |
|---|---|
| `initialize` | Lock deposit, set tenant/landlord/arbitrator, anchor lease hash |
| `release` | Full deposit return to tenant (tenant + landlord auth) |
| `release_split` | Partial deduction agreed by both parties |
| `dispute` | Either party opens a dispute |
| `arbitrate` | Arbitrator resolves dispute with a split decision |
| `clawback` | Landlord reclaims deposit on proven damage (arbitrator co-signs) |
| `state` | Read current escrow state |
| `balance` | Read USDC balance held in contract |

**States:** `Active → Released | Disputed | Clawback`

### `arbitration/`

Decentralized arbitration voting. A panel of arbitrators votes on a deposit split; a simple majority finalises the decision.

| Function | Description |
|---|---|
| `initialize` | Register panel (min 3), deposit amount, lease ID |
| `vote` | Cast a split vote (each arbitrator votes once) |
| `decision` | Read finalised decision (None until quorum reached) |
| `vote_count` | Read number of votes cast |

## Building

```bash
# Install Stellar CLI
cargo install --locked stellar-cli --features opt

# Build contracts
cd contracts
cargo build --target wasm32-unknown-unknown --release

# Run tests
cargo test
```

## Deployment (testnet)

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/trustrent_escrow.wasm \
  --source <your-secret-key> \
  --network testnet
```

## Status

| Contract | Tests | Testnet deploy |
|---|---|---|
| `escrow` | ✅ 6 passing | Pending |
| `arbitration` | ✅ 4 passing | Pending |

These contracts are on the v0.4 roadmap. The current production escrow uses Stellar native multi-sig (`src/stellar/escrow.js`).
