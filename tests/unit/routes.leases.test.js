/**
 * Leases API route tests via supertest.
 * Verifies validation and the new lease-party authorization behavior.
 */

jest.mock('../../src/db/models/lease');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const Lease = require('../../src/db/models/lease');
const app = require('../../src/api/app');

process.env.JWT_SECRET = 'test-secret';

function tokenFor(id = 'landlord-1') {
  return jwt.sign({ id, role: 'landlord' }, process.env.JWT_SECRET);
}

const leaseRow = {
  id: 'lease-1',
  landlord_id: 'landlord-1',
  tenant_id: 'tenant-1',
  agent_id: null,
  status: 'pending',
  property_address: '1 Main St',
  rent_amount: '500.00',
  deposit_amount: '250.00',
};

describe('POST /api/v1/leases', () => {
  test('creates a lease owned by the authenticated landlord', async () => {
    Lease.create.mockResolvedValue({ rows: [leaseRow] });
    const res = await request(app)
      .post('/api/v1/leases')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({
        tenant_id: '00000000-0000-0000-0000-000000000001',
        property_address: '1 Main St',
        rent_amount: '500.00',
        deposit_amount: '250.00',
        starts_at: '2026-01-01',
        ends_at: '2027-01-01',
        duration_months: 12,
      });
    expect(res.status).toBe(201);
    expect(Lease.create).toHaveBeenCalledWith(expect.objectContaining({
      rent_amount: '500.00',
      landlord_id: 'landlord-1',
    }));
  });

  test('rejects negative monetary amounts', async () => {
    const res = await request(app)
      .post('/api/v1/leases')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({
        tenant_id: '00000000-0000-0000-0000-000000000001',
        property_address: '1 Main St',
        rent_amount: '-500',
        deposit_amount: '0',
        starts_at: '2026-01-01',
        ends_at: '2027-01-01',
        duration_months: 12,
      });
    expect(res.status).toBe(422);
  });

  test('rejects ends_at before starts_at', async () => {
    const res = await request(app)
      .post('/api/v1/leases')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({
        tenant_id: '00000000-0000-0000-0000-000000000001',
        property_address: '1 Main St',
        rent_amount: '500',
        deposit_amount: '250',
        starts_at: '2027-01-01',
        ends_at: '2026-01-01',
        duration_months: 12,
      });
    expect(res.status).toBe(422);
  });

  test('rejects agent_fee_pct outside 0..100', async () => {
    const res = await request(app)
      .post('/api/v1/leases')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({
        tenant_id: '00000000-0000-0000-0000-000000000001',
        property_address: '1 Main St',
        rent_amount: '500',
        deposit_amount: '250',
        agent_fee_pct: 120,
        starts_at: '2026-01-01',
        ends_at: '2027-01-01',
        duration_months: 12,
      });
    expect(res.status).toBe(422);
  });

  test('requires authentication', async () => {
    const res = await request(app).post('/api/v1/leases').send({});
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/leases/:id', () => {
  test('returns the lease to a party', async () => {
    Lease.findById.mockResolvedValue({ rows: [leaseRow] });
    const res = await request(app)
      .get('/api/v1/leases/lease-1')
      .set('Authorization', `Bearer ${tokenFor('tenant-1')}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('lease-1');
  });

  test('forbids unrelated callers', async () => {
    Lease.findById.mockResolvedValue({ rows: [leaseRow] });
    const res = await request(app)
      .get('/api/v1/leases/lease-1')
      .set('Authorization', `Bearer ${tokenFor('stranger')}`);
    expect(res.status).toBe(403);
  });

  test('returns 404 for unknown lease', async () => {
    Lease.findById.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .get('/api/v1/leases/missing')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/leases/:id', () => {
  test('allows the landlord to change status', async () => {
    Lease.findById.mockResolvedValue({ rows: [leaseRow] });
    Lease.updateStatus.mockResolvedValue({
      rows: [{ ...leaseRow, status: 'active' }],
    });
    const res = await request(app)
      .patch('/api/v1/leases/lease-1')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ status: 'active' });
    expect(res.status).toBe(200);
    expect(Lease.updateStatus).toHaveBeenCalledWith('lease-1', 'active');
  });

  test('forbids a tenant from changing status', async () => {
    Lease.findById.mockResolvedValue({ rows: [leaseRow] });
    const res = await request(app)
      .patch('/api/v1/leases/lease-1')
      .set('Authorization', `Bearer ${tokenFor('tenant-1')}`)
      .send({ status: 'active' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/leases/:id', () => {
  test('allows the landlord to cancel a pending lease', async () => {
    Lease.findById.mockResolvedValue({ rows: [leaseRow] });
    Lease.cancel.mockResolvedValue({
      rows: [{ ...leaseRow, status: 'cancelled' }],
    });
    const res = await request(app)
      .delete('/api/v1/leases/lease-1')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(Lease.cancel).toHaveBeenCalledWith('lease-1');
  });

  test('forbids cancelling a non-pending lease', async () => {
    Lease.findById.mockResolvedValue({ rows: [{ ...leaseRow, status: 'active' }] });
    const res = await request(app)
      .delete('/api/v1/leases/lease-1')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(409);
  });
});