/**
 * Escrow API route tests for the deposit-release and dispute lifecycle.
 * DB and Stellar interactions are mocked.
 */

jest.mock('../../src/db/models/lease');
jest.mock('../../src/db/models/dispute');
jest.mock('../../src/services/dispute');
jest.mock('../../src/services/notifications');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const Lease = require('../../src/db/models/lease');
const Dispute = require('../../src/db/models/dispute');
const { openDispute, resolveDeposit, resolveDispute } = require('../../src/services/dispute');
const notifications = require('../../src/services/notifications');
const app = require('../../src/api/app');

process.env.JWT_SECRET = 'test-secret';

const LEASE_ID = '00000000-0000-0000-0000-000000000001';

const activeLease = {
  id: LEASE_ID,
  landlord_id: 'landlord-1',
  tenant_id: 'tenant-1',
  agent_id: null,
  status: 'active',
  escrow_account_pk: 'GESCROW',
  deposit_amount: '1000.00',
};

const disputeRow = {
  id: 'dispute-1',
  lease_id: LEASE_ID,
  raised_by: 'tenant-1',
  reason: 'Ceiling leak during the winter storm',
  status: 'open',
};

function tokenFor(id, role = 'landlord') {
  return jwt.sign({ id, role }, process.env.JWT_SECRET);
}

beforeEach(() => {
  jest.clearAllMocks();
  Lease.findById.mockResolvedValue({ rows: [activeLease] });
});

describe('POST /api/v1/escrow/:leaseId/dispute', () => {
  test('opens a dispute as a lease party', async () => {
    openDispute.mockResolvedValue({ ...disputeRow, status: 'open' });
    const res = await request(app)
      .post(`/api/v1/escrow/${LEASE_ID}/dispute`)
      .set('Authorization', `Bearer ${tokenFor('tenant-1', 'tenant')}`)
      .send({ reason: 'Heating broke and was never fixed', evidence: { note: 'see photos' } });
    expect(res.status).toBe(201);
    expect(openDispute).toHaveBeenCalledWith({
      leaseId: LEASE_ID,
      raisedBy: 'tenant-1',
      reason: 'Heating broke and was never fixed',
      evidence: { note: 'see photos' },
    });
    expect(notifications.notifyDisputeOpened).toHaveBeenCalledWith({
      leaseId: LEASE_ID,
      disputeId: 'dispute-1',
    });
  });

  test('rejects a reason shorter than 10 characters', async () => {
    const res = await request(app)
      .post(`/api/v1/escrow/${LEASE_ID}/dispute`)
      .set('Authorization', `Bearer ${tokenFor('tenant-1', 'tenant')}`)
      .send({ reason: 'short' });
    expect(res.status).toBe(422);
    expect(openDispute).not.toHaveBeenCalled();
  });

  test('rejects a dispute on a lease without an escrow', async () => {
    Lease.findById.mockResolvedValue({ rows: [{ ...activeLease, escrow_account_pk: null }] });
    const res = await request(app)
      .post(`/api/v1/escrow/${LEASE_ID}/dispute`)
      .set('Authorization', `Bearer ${tokenFor('tenant-1', 'tenant')}`)
      .send({ reason: 'This is a sufficiently detailed reason' });
    expect(res.status).toBe(409);
    expect(openDispute).not.toHaveBeenCalled();
  });

  test('rejects an agent from opening a dispute', async () => {
    Lease.findById.mockResolvedValue({
      rows: [{ ...activeLease, agent_id: 'agent-1' }],
    });
    const res = await request(app)
      .post(`/api/v1/escrow/${LEASE_ID}/dispute`)
      .set('Authorization', `Bearer ${tokenFor('agent-1', 'agent')}`)
      .send({ reason: 'This is a sufficiently detailed reason' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/escrow/:leaseId/disputes', () => {
  test('lists disputes for a lease', async () => {
    Dispute.findByLease.mockResolvedValue({ rows: [disputeRow] });
    const res = await request(app)
      .get(`/api/v1/escrow/${LEASE_ID}/disputes`)
      .set('Authorization', `Bearer ${tokenFor('tenant-1', 'tenant')}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('dispute-1');
  });
});

describe('POST /api/v1/escrow/:leaseId/release', () => {
  test('releases the full deposit to the tenant by default', async () => {
    resolveDeposit.mockResolvedValue({
      tenant: '1000.0000000',
      landlord: '0.0000000',
      kind: 'full',
      tenant_share_pct: 100,
    });
    Lease.updateStatus.mockResolvedValue({ rows: [{ ...activeLease, status: 'ended' }] });

    const res = await request(app)
      .post(`/api/v1/escrow/${LEASE_ID}/release`)
      .set('Authorization', `Bearer ${tokenFor('tenant-1', 'tenant')}`)
      .send({});
    expect(res.status).toBe(200);
    expect(resolveDeposit).toHaveBeenCalledWith(expect.objectContaining({ tenantSharePct: 100 }));
    expect(Lease.updateStatus).toHaveBeenCalledWith(LEASE_ID, 'ended');
    expect(notifications.notifyDepositReleased).toHaveBeenCalledWith(
      expect.objectContaining({ leaseId: LEASE_ID, kind: 'full' }),
    );
  });

  test('supports an agreed partial deduction', async () => {
    resolveDeposit.mockResolvedValue({
      tenant: '800.0000000',
      landlord: '200.0000000',
      kind: 'split',
      tenant_share_pct: 80,
    });
    const res = await request(app)
      .post(`/api/v1/escrow/${LEASE_ID}/release`)
      .set('Authorization', `Bearer ${tokenFor('landlord-1')}`)
      .send({ tenant_share_pct: 80, resolution_note: 'agreed' });
    expect(res.status).toBe(200);
    expect(resolveDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ tenantSharePct: 80, resolutionNote: 'agreed' }),
    );
  });

  test('rejects an out-of-range tenant share', async () => {
    const res = await request(app)
      .post(`/api/v1/escrow/${LEASE_ID}/release`)
      .set('Authorization', `Bearer ${tokenFor('tenant-1', 'tenant')}`)
      .send({ tenant_share_pct: 150 });
    expect(res.status).toBe(422);
    expect(Lease.updateStatus).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/escrow/:leaseId/disputes/:disputeId/resolve', () => {
  test('records a resolved dispute decision', async () => {
    Dispute.findById.mockResolvedValue({ rows: [disputeRow] });
    resolveDispute.mockResolvedValue({ ...disputeRow, status: 'resolved', tenant_share_pct: 80 });

    const res = await request(app)
      .post(`/api/v1/escrow/${LEASE_ID}/disputes/dispute-1/resolve`)
      .set('Authorization', `Bearer ${tokenFor('tenant-1', 'tenant')}`)
      .send({ tenant_share_pct: 80, resolution_note: 'arbitrated' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(resolveDispute).toHaveBeenCalledWith({
      disputeId: 'dispute-1',
      tenantSharePct: 80,
      resolutionNote: 'arbitrated',
      resolvedBy: 'tenant-1',
    });
  });

  test('404 when the dispute does not belong to the lease', async () => {
    Dispute.findById.mockResolvedValue({
      rows: [{ ...disputeRow, lease_id: '00000000-0000-0000-0000-000000000099' }],
    });
    const res = await request(app)
      .post(`/api/v1/escrow/${LEASE_ID}/disputes/dispute-1/resolve`)
      .set('Authorization', `Bearer ${tokenFor('tenant-1', 'tenant')}`)
      .send({ tenant_share_pct: 80 });
    expect(res.status).toBe(404);
    expect(resolveDispute).not.toHaveBeenCalled();
  });
});
