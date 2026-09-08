/**
 * Lease authorization middleware unit tests.
 */

jest.mock('../../src/db/models/lease');
const Lease = require('../../src/db/models/lease');
const { authorizeLease } = require('../../src/api/middleware/authorize');

function mockReq(params = {}, body = {}) {
  return { params, body, user: { id: 'user-1' } };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const leaseRow = {
  id: 'lease-1',
  landlord_id: 'user-1',
  tenant_id: 'user-2',
  agent_id: 'user-3',
};

describe('authorizeLease middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns 404 when the lease does not exist', async () => {
    Lease.findById.mockResolvedValue({ rows: [] });
    const req = mockReq({ id: 'nope' });
    const res = mockRes();
    await authorizeLease(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('reads lease id from params.id', async () => {
    Lease.findById.mockResolvedValue({ rows: [leaseRow] });
    const req = mockReq({ id: 'lease-1' });
    const next = jest.fn();
    await authorizeLease(req, mockRes(), next);
    expect(Lease.findById).toHaveBeenCalledWith('lease-1');
    expect(req.lease).toEqual(leaseRow);
    expect(next).toHaveBeenCalled();
  });

  test('reads lease id from body.lease_id (POST payments)', async () => {
    Lease.findById.mockResolvedValue({ rows: [leaseRow] });
    const req = mockReq({}, { lease_id: 'lease-1' });
    const next = jest.fn();
    await authorizeLease(req, mockRes(), next);
    expect(Lease.findById).toHaveBeenCalledWith('lease-1');
    expect(next).toHaveBeenCalled();
  });

  test('forbids callers who are not a party to the lease', async () => {
    Lease.findById.mockResolvedValue({ rows: [leaseRow] });
    const req = mockReq({ id: 'lease-1' });
    req.user.id = 'intruder';
    const res = mockRes();
    await authorizeLease(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'You are not a party to this lease' });
  });

  test('treats ids as strings regardless of DB type', async () => {
    Lease.findById.mockResolvedValue({
      rows: [{ ...leaseRow, landlord_id: 'L1', tenant_id: 'T1' }],
    });
    const req = mockReq({ id: 'x' });
    req.user.id = 'T1';
    const next = jest.fn();
    await authorizeLease(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});