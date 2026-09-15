/**
 * App-level security middleware tests: helmet headers, request IDs, CORS
 * allow-list enforcement, and scoped auth rate limiting.
 */

jest.mock('../../src/db/pool', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
}));

const request = require('supertest');

const DEFAULT_ORIGINS = process.env.CORS_ORIGINS;

afterEach(() => {
  if (DEFAULT_ORIGINS === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = DEFAULT_ORIGINS;
  jest.resetModules();
});

describe('security headers', () => {
  test('sends helmet security headers', async () => {
    const app = require('../../src/api/app');
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBeDefined();
  });

  test('attaches a request id to every response', async () => {
    const app = require('../../src/api/app');
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('CORS allow-list', () => {
  test('rejects origins not on the allow-list', async () => {
    process.env.CORS_ORIGINS = 'https://trusted.example';
    const app = require('../../src/api/app');
    const res = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/origin/i);
  });

  test('allows origins on the allow-list', async () => {
    process.env.CORS_ORIGINS = 'https://trusted.example';
    const app = require('../../src/api/app');
    const res = await request(app).get('/health').set('Origin', 'https://trusted.example');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://trusted.example');
  });

  test('denies browser origins when no allow-list is configured', async () => {
    delete process.env.CORS_ORIGINS;
    const app = require('../../src/api/app');
    const res = await request(app).get('/health').set('Origin', 'https://untrusted.example');
    expect(res.status).toBe(403);
  });

  test('still allows non-browser clients with no Origin header', async () => {
    delete process.env.CORS_ORIGINS;
    const app = require('../../src/api/app');
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
