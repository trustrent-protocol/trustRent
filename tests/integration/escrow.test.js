/**
 * Integration tests — run against testnet.
 * Requires a funded testnet account and DATABASE_URL.
 *
 * Run with: npm run test:testnet
 */

// Placeholder — full integration tests require live testnet accounts.
// See docs/architecture.md for testnet setup instructions.

describe('escrow integration (testnet)', () => {
  test.todo('creates escrow account with correct multi-sig configuration');
  test.todo('deposit is locked and cannot be moved with single signature');
  test.todo('deposit releases with 2-of-3 signatures');
});

describe('payment integration (testnet)', () => {
  test.todo('submits rent payment and returns tx hash');
  test.todo('agent fee split is reflected on-chain');
  test.todo('indexer picks up confirmed payment');
});
