/**
 * Payments API route tests via supertest, all DB and Stellar interactions mocked.
 */

jest.mock('../../src/db/models/payment');
jest.mock('../../src/db/models/lease');
jest.mock('../../src/db/pool');
jest.mock('../../src/stellar/payments');
jest.mock('../../src/services/notifications');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const Payment = require('../../src/db/models/payment');
const Lease = require('../../src/db/models/lease');
const { submitRentPayment } = require('../../src/stellar/payments');
const app = require('../../src/api/app');

process.env.JWT_SECRET = 'test-secret';

const LEASE_ID = '00000000-0000-0000-0000-000000000001';

const activeLease = {
  id: LEASE_ID,
  landlord_id: 'landlord-1',
  tenant_id: 'tenant-1',
  agent_id: null,
  status: 'active',
  agent_fee_pct: '0',
};

const confirmedPayment = {
  id: 'pay-1',
  lease_id: LEASE_ID,
  amount: '500.00',
  status: 'confirmed',
  tx_hash: 'txhash123',
  ledger: 123456,
  settled_at: '2026-01-01T00:00:00.000Z',
};

function tenantToken() {
  return jwt.sign({ id: 'tenant-1', role: 'tenant' }, process.env.JWT_SECRET);
}

function baseBody(overrides = {}) {
  return {
    lease_id: LEASE_ID,
    amount: '500.00',
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/v1/payments', () => {
  test('submits a payment and confirms it', async () => {
    Lease.findById.mockResolvedValue({ rows: [activeLease] });
    Payment.findByIdempotency.mockResolvedValue({ rows: [] });
    Payment.create.mockResolvedValue({
      rows: [{ id: 'pay-1', status: 'pending' }],
    });
    const pool = require('../../src/db/pool');
    pool.query.mockResolvedValue({
      rows: [
        { id: 'tenant-1', stellar_pk: 'T' },
        { id: 'landlord-1', stellar_pk: 'L' },
      ],
    });
    submitRentPayment.mockResolvedValue({
      txHash: 'txhash123',
      ledger: 123456,
      settledAt: '2026-01-01T00:00:00.000Z',
      splits: [{ recipient: 'landlord', amount: '500.00', asset: 'USDC' }],
    });
    Payment.confirm.mockResolvedValue({ rows: [confirmedPayment] });

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tenantToken()}`)
      .send(baseBody());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('confirmed');
    expect(Payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ lease_id: LEASE_ID, idempotency_key: null }),
    );
  });

  test('replays an already-confirmed payment as 200 without resubmitting', async () => {
    Lease.findById.mockResolvedValue({ rows: [activeLease] });
    Payment.findByIdempotency.mockResolvedValue({ rows: [confirmedPayment] });

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tenantToken()}`)
      .send(baseBody({ idempotency_key: 'rent-jan-2026' }));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('pay-1');
    expect(submitRentPayment).not.toHaveBeenCalled();
    expect(Payment.create).not.toHaveBeenCalled();
  });

  test('rejects a duplicate in-flight submission as 409', async () => {
    Lease.findById.mockResolvedValue({ rows: [activeLease] });
    Payment.findByIdempotency.mockResolvedValue({
      rows: [{ id: 'pay-2', lease_id: 'lease-1', status: 'pending' }],
    });

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tenantToken()}`)
      .send(baseBody({ idempotency_key: 'rent-feb-2026' }));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already being submitted/);
    expect(submitRentPayment).not.toHaveBeenCalled();
  });

  test('requires a fresh key after a failed attempt', async () => {
    Lease.findById.mockResolvedValue({ rows: [activeLease] });
    Payment.findByIdempotency.mockResolvedValue({
      rows: [{ id: 'pay-3', lease_id: 'lease-1', status: 'failed' }],
    });

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tenantToken()}`)
      .send(baseBody({ idempotency_key: 'rent-mar-2026' }));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/fresh idempotency_key/);
  });

  test('marks the pending record failed when submission throws', async () => {
    Lease.findById.mockResolvedValue({ rows: [activeLease] });
    Payment.findByIdempotency.mockResolvedValue({ rows: [] });
    Payment.create.mockResolvedValue({ rows: [{ id: 'pay-1', status: 'pending' }] });
    const pool = require('../../src/db/pool');
    pool.query.mockResolvedValue({ rows: [] });
    submitRentPayment.mockRejectedValue(new Error('timeout on horizon'));

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tenantToken()}`)
      .send(baseBody());
    expect(res.status).toBe(500);
    expect(Payment.markFailed).toHaveBeenCalledWith('pay-1', 'timeout on horizon');
  });

  test('rejects an invalid idempotency_key format', async () => {
    Lease.findById.mockResolvedValue({ rows: [activeLease] });
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tenantToken()}`)
      .send(baseBody({ idempotency_key: 'not allowed spaces!' }));
    expect(res.status).toBe(422);
    expect(Payment.create).not.toHaveBeenCalled();
  });

  test('handles a unique-violation race by returning the winner', async () => {
    Lease.findById.mockResolvedValue({ rows: [activeLease] });
    Payment.findByIdempotency.mockResolvedValue({ rows: [] });
    const dupErr = new Error('duplicate');
    dupErr.code = '23505';
    Payment.create.mockRejectedValueOnce(dupErr);
    Payment.findByIdempotency.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [confirmedPayment],
    });

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tenantToken()}`)
      .send(baseBody({ idempotency_key: 'rent-race-2026' }));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('pay-1');
  });
});
