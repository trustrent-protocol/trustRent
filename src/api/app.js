const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const leasesRouter = require('./routes/leases');
const escrowRouter = require('./routes/escrow');
const paymentsRouter = require('./routes/payments');
const usersRouter = require('./routes/users');

const app = express();

// Trust one proxy hop when deployed behind a reverse proxy so rate limiting
// and request IDs see the real client.
app.set('trust proxy', 1);

app.use(helmet());

// Restrict CORS to an explicit allow-list. Never reflects arbitrary origins:
// an open CORS policy defeats the JWT auth boundary for any script running on
// a malicious page while a user is logged in.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      // Allow non-browser clients (curl, SDKs) which send no Origin.
      if (!origin) return cb(null, true);
      // Deny-all by default: without an explicit allow-list no browser page
      // may call the API, which keeps the JWT auth boundary intact.
      if (!allowedOrigins.length) return cb(new Error('Origin not allowed by CORS'));
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '100kb' }));

// Global safety net and request instrumentation: every request gets an id for
// log correlation and a lightweight access log line.
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  res.setHeader('X-Request-Id', req.id);
  res.locals.startedAt = Date.now();
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;
    const ms = Date.now() - res.locals.startedAt;
    const origin = req.headers.origin || '-';
    console.log(
      `${req.id} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms origin=${origin}`,
    );
  });
  next();
});

// Global API rate limit. Permit a higher default for health probes and the
// payment/escrow long-poles, but still catch runaway clients. Stricter,
// purpose-specific limits are applied on the auth routes.
const globalLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 1000),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});
app.use(globalLimit);

// GET /health — liveness + DB reachability probe
app.get('/health', async (_req, res) => {
  try {
    const pool = require('../db/pool');
    await pool.query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime(), db: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', uptime: process.uptime(), db: 'down' });
  }
});

app.use('/api/v1/leases', leasesRouter);
app.use('/api/v1/escrow', escrowRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/users', usersRouter);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralized error handler
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && /Origin not allowed/i.test(err.message)) {
    return res.status(403).json({ error: 'Origin not allowed by CORS' });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    console.error(`[${req.id}] ${req.method} ${req.originalUrl}:`, err);
  }
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message || 'Request failed',
  });
});

module.exports = app;
