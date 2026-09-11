/**
 * Dispute and deposit-release service unit tests.
 */

jest.mock('../../src/db/models/dispute');
const Dispute = require('../../src/db/models/dispute');
const {
  computeSplit,
  openDispute,
  resolveDeposit,
  resolveDispute,
} = require('../../src/services/dispute');

describe('computeSplit', () => {
  test('100% share returns the full deposit to the tenant', () => {
    const s = computeSplit('1000.00', 100);
    expect(s.tenant).toBe('1000.0000000');
    expect(s.landlord).toBe('0.0000000');
    expect(s.kind).toBe('full');
    expect(s.total).toBe('1000.0000000');
  });

  test('splits exactly and sums to the deposit', () => {
    const s = computeSplit('1000.00', 80);
    expect(s.tenant).toBe('800.0000000');
    expect(s.landlord).toBe('200.0000000');
    expect(s.kind).toBe('split');
  });

  test('supports fractional share percentages', () => {
    const s = computeSplit('3030.00', 33.33);
    expect(s.tenant).toBe('1009.8990000');
    expect(s.landlord).toBe('2020.1010000');
  });

  test('rejects out-of-range shares', () => {
    expect(() => computeSplit('1000.00', 101)).toThrow('tenant_share_pct');
    expect(() => computeSplit('1000.00', -5)).toThrow('tenant_share_pct');
    expect(() => computeSplit('1000.00', NaN)).toThrow('tenant_share_pct');
  });
});

describe('openDispute', () => {
  beforeEach(() => jest.clearAllMocks());

  test('persists the dispute', async () => {
    Dispute.create.mockResolvedValue({ rows: [{ id: 'd1', status: 'open' }] });
    const dispute = await openDispute({
      leaseId: 'lease-1',
      raisedBy: 'user-1',
      reason: 'Ceiling leak during the winter storm',
      evidence: { photos: ['https://cdn.example/leak.jpg'] },
    });
    expect(Dispute.create).toHaveBeenCalledWith({
      lease_id: 'lease-1',
      raised_by: 'user-1',
      reason: 'Ceiling leak during the winter storm',
      evidence: { photos: ['https://cdn.example/leak.jpg'] },
    });
    expect(dispute.status).toBe('open');
  });

  test('rejects a too-short reason', async () => {
    await expect(
      openDispute({ leaseId: 'lease-1', raisedBy: 'user-1', reason: 'short' }),
    ).rejects.toMatchObject({ status: 422 });
    expect(Dispute.create).not.toHaveBeenCalled();
  });
});

describe('resolveDeposit', () => {
  const activeLease = {
    status: 'active',
    escrow_account_pk: 'GESCROW',
    deposit_amount: '1000.00',
  };

  test('builds a full-release plan for a clean exit', async () => {
    const plan = await resolveDeposit({ lease: activeLease });
    expect(plan.tenant).toBe('1000.0000000');
    expect(plan.landlord).toBe('0.0000000');
    expect(plan.kind).toBe('full');
    expect(plan.escrow_account_pk).toBe('GESCROW');
  });

  test('builds a split plan for an agreed deduction', async () => {
    const plan = await resolveDeposit({
      lease: activeLease,
      tenantSharePct: 80,
      resolutionNote: 'agreed 20% for damages',
      resolvedBy: 'user-9',
    });
    expect(plan.tenant).toBe('800.0000000');
    expect(plan.landlord).toBe('200.0000000');
    expect(plan.resolution_note).toBe('agreed 20% for damages');
    expect(plan.resolved_by).toBe('user-9');
  });

  test('rejects release from an unescrowed or inactive lease', async () => {
    await expect(
      resolveDeposit({ lease: { status: 'pending', escrow_account_pk: null } }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      resolveDeposit({
        lease: { status: 'active', escrow_account_pk: null, deposit_amount: '1000' },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('resolveDispute', () => {
  beforeEach(() => jest.clearAllMocks());

  test('marks the dispute resolved with the agreed split', async () => {
    Dispute.resolve.mockResolvedValue({
      rows: [{ id: 'd1', status: 'resolved', tenant_share_pct: 80 }],
    });
    const dispute = await resolveDispute({
      disputeId: 'd1',
      tenantSharePct: 80,
      resolutionNote: 'arbitrated',
      resolvedBy: 'user-9',
    });
    expect(Dispute.resolve).toHaveBeenCalledWith('d1', 80, 'user-9', 'arbitrated');
    expect(dispute.status).toBe('resolved');
  });

  test('404 when the dispute does not exist', async () => {
    Dispute.resolve.mockResolvedValue({ rows: [] });
    await expect(resolveDispute({ disputeId: 'nope', tenantSharePct: 50 })).rejects.toMatchObject({
      status: 404,
    });
  });

  test('rejects out-of-range tenant shares', async () => {
    await expect(resolveDispute({ disputeId: 'd1', tenantSharePct: 250 })).rejects.toMatchObject({
      status: 422,
    });
  });
});
