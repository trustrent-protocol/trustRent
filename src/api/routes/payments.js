const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const { authorizeLease } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const Payment = require('../../db/models/payment');
const Lease = require('../../db/models/lease');
const { submitRentPayment } = require('../../stellar/payments');

// POST /api/v1/payments
router.post('/',
  auth,
  authorizeLease,
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

      const lease = req.lease;
      if (lease.status !== 'active') {
        return res.status(409).json({ error: 'Lease is not active' });
      }
      if (String(lease.tenant_id) !== String(req.user.id)) {
        return res.status(403).json({ error: 'Only the tenant can submit payments' });
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
    const { rows } = await Lease.findById(req.params.leaseId);
    const lease = rows[0];
    if (!lease) return res.status(404).json({ error: 'Lease not found' });

    const involved = [lease.landlord_id, lease.tenant_id, lease.agent_id]
      .filter(Boolean)
      .map(String);
    if (!involved.includes(String(req.user.id))) {
      return res.status(403).json({ error: 'You are not a party to this lease' });
    }

    const { rows: payments } = await Payment.findByLease(req.params.leaseId);
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/payments/receipt/:txHash
router.get('/receipt/:txHash', auth, async (req, res, next) => {
  try {
    const { rows } = await Payment.findByTxHash(req.params.txHash);
    const payment = rows[0];
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const { rows: leases } = await Lease.findById(payment.lease_id);
    const lease = leases[0];
    if (!lease) return res.status(404).json({ error: 'Payment not found' });

    const involved = [lease.landlord_id, lease.tenant_id, lease.agent_id]
      .filter(Boolean)
      .map(String);
    if (!involved.includes(String(req.user.id))) {
      return res.status(403).json({ error: 'You are not a party to this lease' });
    }

    res.json(payment);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
