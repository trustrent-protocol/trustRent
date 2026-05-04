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

app.use('/api/v1/leases', leasesRouter);
app.use('/api/v1/escrow', escrowRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/users', usersRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
