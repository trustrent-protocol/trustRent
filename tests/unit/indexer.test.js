/**
 * Indexer unit tests — watch-list building, memo-tag correlation, and the
 * guard rails that keep payments out of the ledger when they don't belong.
 */

jest.mock('../../src/db/pool');
jest.mock('../../src/services/notifications');

const pool = require('../../src/db/pool');
const { notifyPaymentConfirmed } = require('../../src/services/notifications');
const { loadWatchList, indexPayment, matchLease, memoText } = require('../../src/stellar/indexer');

const LEASE_A = '00000000-0000-0000-0000-0000000000aa';
const LEASE_B = '00000000-0000-0000-0000-0000000000bb';

const usdcPayment = (overrides = {}) => ({
  type: 'payment',
  asset_code: 'USDC',
  amount: '500.0000000',
  transaction_hash: 'deadbeef',
  ledger: 100,
  created_at: '2026-01-05T00:00:00.000Z',
  paging_token: '100-1',
  memo: { type: 'text', value: `trustrent:0000000000aa jan` },
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('memoText', () => {
  test('extracts text memos from SSE payloads', () => {
    expect(memoText({ memo: { type: 'text', value: 'hi' } })).toBe('hi');
    expect(memoText({ memo: 'hi' })).toBe('hi');
    expect(memoText({})).toBeNull();
    expect(memoText({ memo: { type: 'none' } })).toBeNull();
  });
});

describe('matchLease', () => {
  const leases = [
    { lease_id: LEASE_A, rent_amount: '500.00', tag: '0000000000aa' },
    { lease_id: LEASE_B, rent_amount: '750.00', tag: '0000000000bb' },
  ];

  test('resolves a stamped memo to its lease', () => {
    expect(matchLease(usdcPayment(), leases)?.lease_id).toBe(LEASE_A);
  });

  test('returns null for payments without a trustrent stamp', () => {
    expect(
      matchLease(usdcPayment({ memo: { type: 'text', value: 'rent jan' } }), leases),
    ).toBeNull();
    expect(matchLease(usdcPayment({ memo: null }), leases)).toBeNull();
  });

  test('returns null for an unknown tag', () => {
    expect(
      matchLease(usdcPayment({ memo: { type: 'text', value: 'trustrent:ffffffffffff' } }), leases),
    ).toBeNull();
  });
});

describe('indexPayment', () => {
  const leases = [{ lease_id: LEASE_A, rent_amount: '500.00', tag: '0000000000aa' }];

  test('indexes a matching payment and notifies', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // dedupe check
      .mockResolvedValueOnce({ rows: [] }); // insert
    const outcome = await indexPayment({ payment: usdcPayment(), accountId: 'LANDLORD', leases });
    expect(outcome).toBe('indexed');
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO payments'),
      expect.arrayContaining([LEASE_A, '500.0000000', 'USDC', 'deadbeef']),
    );
    expect(notifyPaymentConfirmed).toHaveBeenCalledWith({
      leaseId: LEASE_A,
      txHash: 'deadbeef',
      amount: '500.0000000',
    });
  });

  test('skips non-payment operations', async () => {
    expect(
      await indexPayment({ payment: { type: 'create_account' }, accountId: 'A', leases }),
    ).toBe('skipped');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejects unsupported asset codes', async () => {
    const payment = usdcPayment({ asset_code: 'GOLD' });
    expect(await indexPayment({ payment, accountId: 'A', leases })).toBe('skipped');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejects unstamped payments (phantom records)', async () => {
    const payment = usdcPayment({ memo: { type: 'text', value: 'rent' } });
    expect(await indexPayment({ payment, accountId: 'A', leases })).toBe('skipped');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejects amount mismatches against the scheduled rent', async () => {
    const payment = usdcPayment({ amount: '0.0100000' });
    expect(await indexPayment({ payment, accountId: 'A', leases })).toBe('skipped');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('does not duplicate an already-indexed transaction', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'pay-9' }] });
    expect(await indexPayment({ payment: usdcPayment(), accountId: 'A', leases })).toBe(
      'already-indexed',
    );
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

describe('loadWatchList', () => {
  test('groups landlord and agent accounts and derives memo tags', async () => {
    pool.query.mockResolvedValue({
      rows: [
        { lease_id: LEASE_A, rent_amount: '500.00', stellar_pk: 'GLANDLORD' },
        { lease_id: LEASE_A, rent_amount: '500.00', stellar_pk: 'GAGENT' },
      ],
    });
    const watchList = await loadWatchList();
    expect(watchList).toEqual([
      {
        account: 'GLANDLORD',
        leases: [{ lease_id: LEASE_A, rent_amount: '500.00', tag: '0000000000aa' }],
      },
      {
        account: 'GAGENT',
        leases: [{ lease_id: LEASE_A, rent_amount: '500.00', tag: '0000000000aa' }],
      },
    ]);
  });
});
