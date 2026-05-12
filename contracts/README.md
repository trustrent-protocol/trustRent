# Soroban Contracts (Experimental)

This directory contains experimental Soroban smart contract implementations planned for v0.4.

## Status

| Contract | Status |
|---|---|
| `escrow/` | Planned — v0.4 |
| `arbitration/` | Planned — v0.4 |

## Current Approach

trustRent currently uses Stellar's native multi-signature primitives for escrow enforcement. See `src/stellar/escrow.js`.

Soroban contracts will be introduced in v0.4 to enable:
- Automated late-fee calculation
- Scheduled recurring payments
- Decentralized arbitration voting
