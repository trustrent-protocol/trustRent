const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const Payment = require('../../db/models/payment');
const Lease = require('../../db/models/lease');
const { submitRentPayment } = require('../../stellar/payments');

// POST /api/v1/payments
router.post('/',
  auth,
  body('lease_id').isUUID(),
  body('amount').isNumeric(),
  body('asset').optional().equals('USDC'),
  validate,
  async (req, res, next) => {
    try {
      const { lease_id, amount, asset = 'USDC', memo, tenant_secret_key } = req.body;
      // TODO: secret key should never travel over the wire in production.
      // This will be replaced by a client-side signing flow (WalletConnect / Freighter)
      // or a server-side signing service in v0.2.

      const { rows } = await Lease.findById(lease_id);
      const lease = rows[0];
      if (!lease) return res.status(404).json({ error: 'Lease not found' });
      if (lease.status !== 'active') {
        return res.status(409).json({ error: 'Lease is not active' });
      }

      const pool = require('../../db/pool');
      const { rows: users } = await pool.query(
        'SELECT id, stellar_pk FROM users WHERE id = ANY($1)',
        [[lease.tenant_id, lease.landlord_id, lease.agent_id].filter(Boolean)]
      );
      const byId = Object.fromEntries(users.map(u => [u.id, u.stellar_pk]));

      // Create pending payment record
      const { rows: [pending] } = await Payment.create({ lease_id, amount, asset, memo });

      const result = await submitRentPayment({
        tenantSecretKey: tenant_secret_key,
        landlordPublicKey: byId[lease.landlord_id],
        agentPublicKey: lease.agent_id ? byId[lease.agent_id] : null,
        amount,
        agentFeePct: parseFloat(lease.agent_fee_pct) || 0,
        memo,
      });

      const { rows: [confirmed] } = await Payment.confirm(
        pending.id,
        result.txHash,
        result.ledger,
        result.splits,
        result.settledAt
      );

      res.status(201).json({
        id: confirmed.id,
        status: confirmed.status,
        txHash: confirmed.tx_hash,
        ledger: confirmed.ledger,
        settledAt: confirmed.settled_at,
        splits: result.splits,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/payments/:leaseId
router.get('/:leaseId', auth, async (req, res, next) => {
  try {
    const { rows } = await Payment.findByLease(req.params.leaseId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/payments/receipt/:txHash
router.get('/receipt/:txHash', auth, async (req, res, next) => {
  try {
    const { rows } = await Payment.findByTxHash(req.params.txHash);
    if (!rows[0]) return res.status(404).json({ error: 'Payment not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
