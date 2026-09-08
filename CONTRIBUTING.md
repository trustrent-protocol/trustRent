# Contributing to trustRent

Thanks for your interest in contributing. Please read this before opening a PR.

## Getting Started

```bash
git clone https://github.com/your-username/trustrent.git
cd trustrent
npm install
cp .env.example .env
```

You'll need a local PostgreSQL database:

```bash
createdb trustrent
npm run migrate
```

Start the dev server:

```bash
npm run dev
```

## Development Standards

- All monetary values must be stored and transmitted as **strings**, never floats
- Every Stellar operation must be tested against testnet before merge
- No external dependencies with access to private keys
- All API endpoints must have integration tests

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(api): add deposit release endpoint
fix(stellar): handle sequence number mismatch on retry
docs: update escrow architecture notes
test(contracts): add arbitration quorum edge case
chore: bump soroban-sdk to 26.1.0
```

## Pull Request Process

1. Branch from `main`: `git checkout -b feat/your-feature`
2. Write tests for your change
3. Run `npm test` (JS) and `cargo test` (Rust contracts) — both must pass
4. Open a PR with a clear description of what and why
5. Link any related issues

## Working on Soroban Contracts

```bash
cd contracts

# Run tests
cargo test

# Build WASM (requires wasm32v1-none target)
rustup target add wasm32v1-none
cargo build --target wasm32v1-none --release
```

See `contracts/README.md` for contract-specific details.

## Security

Do **not** open public issues for security vulnerabilities.  
Email: `security@trustrent.xyz`  
PGP key published on release tags and `hkps://keys.openpgp.org`.

## Areas We Need Help

- Stellar SDK and Soroban smart contracts
- Emerging market payment systems (M-Pesa, mobile money, local stablecoins)
- Frontend development (React, React Native)
- Security engineering
