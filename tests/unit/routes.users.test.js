/**
 * Users API route tests via supertest, DB model mocked.
 */

jest.mock('../../src/db/models/user');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../src/db/models/user');
const app = require('../../src/api/app');

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
});

describe('POST /api/v1/users/register', () => {
  test('registers a user and returns a token', async () => {
    User.create.mockResolvedValue({
      rows: [{ id: 'u1', email: 'a@b.com', role: 'tenant' }],
    });
    const res = await request(app)
      .post('/api/v1/users/register')
      .send({ email: 'a@b.com', password: 'password123', role: 'tenant' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toEqual({ id: 'u1', email: 'a@b.com', role: 'tenant' });
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.id).toBe('u1');
  });

  test('returns 422 for invalid payloads', async () => {
    const res = await request(app)
      .post('/api/v1/users/register')
      .send({ email: 'not-an-email', password: 'short', role: 'nobody' });
    expect(res.status).toBe(422);
  });

  test('returns 409 on duplicate email', async () => {
    const err = new Error('duplicate');
    err.code = '23505';
    User.create.mockRejectedValue(err);
    const res = await request(app)
      .post('/api/v1/users/register')
      .send({ email: 'dup@b.com', password: 'password123', role: 'landlord' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already registered');
  });
});

describe('POST /api/v1/users/login', () => {
  test('returns a token for valid credentials', async () => {
    const hash = await bcrypt.hash('password123', 1);
    User.findByEmail.mockResolvedValue({
      rows: [{ id: 'u1', email: 'a@b.com', role: 'tenant', password: hash }],
    });
    const res = await request(app)
      .post('/api/v1/users/login')
      .send({ email: 'a@b.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('returns 401 for wrong password', async () => {
    const hash = await bcrypt.hash('password123', 1);
    User.findByEmail.mockResolvedValue({
      rows: [{ id: 'u1', email: 'a@b.com', role: 'tenant', password: hash }],
    });
    const res = await request(app)
      .post('/api/v1/users/login')
      .send({ email: 'a@b.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  test('returns 401 for unknown email', async () => {
    User.findByEmail.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/v1/users/login')
      .send({ email: 'ghost@b.com', password: 'password123' });
    expect(res.status).toBe(401);
  });
});