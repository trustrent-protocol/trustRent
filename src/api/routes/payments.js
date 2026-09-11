const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const { authorizeLease } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { money } = require('../validators/money');
const Payment = require('../../db/models/payment');
const Lease = require('../../db/models/lease');
const { submitRentPayment } = require('../../stellar/payments');
const { notifyPaymentConfirmed } = require('../../services/notifications');
const { computeLateFee } = require('../../services/lateFees');
const { buildPaymentSchedule, summarizeSchedule } = require('../../services/schedule');

const IDEMPOTENCY_ERROR_CODE = '23505';

function idempotencyConflict(res, existing) {
  if (existing.status === 'confirmed') {
    return res
      .status(200)
      .json({ id: existing.id, status: existing.status, txHash: existing.tx_hash });
  }
  const detail =
    existing.status === 'pending'
      ? 'A payment with this idempotency_key is already being submitted'
      : 'A payment with this idempotency_key previously failed; use a fresh idempotency_key to retry';
  return res
    .status(409)
    .json({ error: detail, existing: { id: existing.id, status: existing.status } });
}

// POST /api/v1/payments
router.post(
  '/',
  auth,
  authorizeLease,
  body('lease_id').isUUID(),
  money('amount'),
  body('asset').optional().equals('USDC'),
  body('idempotency_key')
    .optional()
    .isString()
    .isLength({ min: 1, max: 64 })
    .matches(/^[A-Za-z0-9_-]+$/),
  validate,
  async (req, res, next) => {
    try {
      const {
        lease_id,
        amount,
        asset = 'USDC',
        memo,
        tenant_secret_key,
        idempotency_key = null,
      } = req.body;
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

      // Idempotent replay: the same logical payment (lease + key) must only
      // ever submit to the ledger once, even if the client retries.
      if (idempotency_key) {
        const { rows } = await Payment.findByIdempotency(lease_id, idempotency_key);
        if (rows[0]) return idempotencyConflict(res, rows[0]);
      }

      const pool = require('../../db/pool');
      const { rows: users } = await pool.query(
        'SELECT id, stellar_pk FROM users WHERE id = ANY($1)',
        [[lease.tenant_id, lease.landlord_id, lease.agent_id].filter(Boolean)],
      );
      const byId = Object.fromEntries(users.map((u) => [u.id, u.stellar_pk]));

      // Create pending payment record
      let pending;
      try {
        const {
          rows: [row],
        } = await Payment.create({ lease_id, amount, asset, memo, idempotency_key });
        pending = row;
      } catch (err) {
        // Lost a race against a concurrent request with the same key.
        if (idempotency_key && err.code === IDEMPOTENCY_ERROR_CODE) {
          const { rows } = await Payment.findByIdempotency(lease_id, idempotency_key);
          return idempotencyConflict(res, rows[0]);
        }
        throw err;
      }

      let result;
      try {
        result = await submitRentPayment({
          tenantSecretKey: tenant_secret_key,
          landlordPublicKey: byId[lease.landlord_id],
          agentPublicKey: lease.agent_id ? byId[lease.agent_id] : null,
          amount,
          agentFeePct: parseFloat(lease.agent_fee_pct) || 0,
          memo,
        });
      } catch (err) {
        // Never leave a payment stuck in 'pending': record the failure and
        // let the client retry safely with a fresh idempotency_key.
        await Payment.markFailed(pending.id, err.message);
        throw err;
      }

      const {
        rows: [confirmed],
      } = await Payment.confirm(
        pending.id,
        result.txHash,
        result.ledger,
        result.splits,
        result.settledAt,
      );

      notifyPaymentConfirmed({
        leaseId: lease_id,
        txHash: result.txHash,
        amount,
      });

      const lateFeeInfo = computeLateFee(lease, new Date());

      res.status(201).json({
        id: confirmed.id,
        status: confirmed.status,
        txHash: confirmed.tx_hash,
        ledger: confirmed.ledger,
        settledAt: confirmed.settled_at,
        splits: result.splits,
        ...(lateFeeInfo.lateFee !== '0.0000000' && {
          late_fee: lateFeeInfo.lateFee,
          days_late: lateFeeInfo.daysLate,
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/payments/:leaseId/schedule
router.get('/:leaseId/schedule', auth, async (req, res, next) => {
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
    if (!lease.starts_at || !lease.duration_months) {
      return res
        .status(422)
        .json({ error: 'Lease is missing schedule parameters (starts_at, duration_months)' });
    }

    const { rows: payments } = await Payment.findByLease(lease.id);
    const paidPeriods = payments
      .filter((p) => p.status === 'confirmed' && p.settled_at)
      .map((p) => new Date(p.settled_at).toISOString().slice(0, 10));

    const schedule = buildPaymentSchedule({
      startsAt: String(lease.starts_at).slice(0, 10),
      durationMonths: lease.duration_months,
      rentAmount: lease.rent_amount,
      rentDueDay: lease.rent_due_day,
    });

    res.json(summarizeSchedule(schedule, { paidPeriods }));
  } catch (err) {
    next(err);
  }
});

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
