const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const leasesRouter = require('./routes/leases');
const escrowRouter = require('./routes/escrow');
const paymentsRouter = require('./routes/payments');
const usersRouter = require('./routes/users');

const app = express();

app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

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
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : (err.message || 'Request failed'),
  });
});

module.exports = app;
