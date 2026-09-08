/**
 * Auth middleware unit tests — verifies Bearer token handling.
 */

jest.mock('jsonwebtoken');
const jwt = require('jsonwebtoken');
const auth = require('../../src/api/middleware/auth');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('auth middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects requests without an Authorization header', () => {
    const req = { headers: {} };
    const res = mockRes();
    auth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid Authorization header' });
  });

  test('rejects non-Bearer schemes', () => {
    const req = { headers: { authorization: 'Basic abc' } };
    const res = mockRes();
    auth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects invalid or expired tokens', () => {
    jwt.verify.mockImplementation(() => { throw new Error('expired'); });
    const req = { headers: { authorization: 'Bearer bad.token.here' } };
    const res = mockRes();
    auth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  test('calls next with req.user set for a valid token', () => {
    const user = { id: 'abc', role: 'tenant' };
    jwt.verify.mockReturnValue(user);
    const req = { headers: { authorization: 'Bearer valid.token' } };
    const next = jest.fn();
    auth(req, mockRes(), next);
    expect(jwt.verify).toHaveBeenCalledWith('valid.token', process.env.JWT_SECRET);
    expect(req.user).toEqual(user);
    expect(next).toHaveBeenCalled();
  });
});