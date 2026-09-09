const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const { authorizeLease } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { money, percentage } = require('../validators/money');
const Lease = require('../../db/models/lease');

// POST /api/v1/leases
router.post(
  '/',
  auth,
  body('tenant_id').isUUID(),
  body('property_address').notEmpty(),
  money('rent_amount'),
  money('deposit_amount'),
  percentage('agent_fee_pct'),
  body('starts_at').isISO8601(),
  body('ends_at')
    .isISO8601()
    .custom((endsAt, { req }) => {
      return new Date(endsAt) > new Date(req.body.starts_at)
        ? true
        : Promise.reject(new Error('ends_at must be after starts_at'));
    }),
  body('duration_months').isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { rows } = await Lease.create({
        ...req.body,
        landlord_id: req.user.id,
      });
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/leases/:id
router.get('/:id', auth, authorizeLease, (req, res) => {
  res.json(req.lease);
});

// PATCH /api/v1/leases/:id
router.patch(
  '/:id',
  auth,
  authorizeLease,
  body('status').isIn(['pending', 'active', 'ended', 'cancelled']),
  validate,
  async (req, res, next) => {
    try {
      if (String(req.lease.landlord_id) !== String(req.user.id)) {
        return res.status(403).json({ error: 'Only the landlord can change lease status' });
      }
      const { rows } = await Lease.updateStatus(req.lease.id, req.body.status);
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/leases/:id  (pre-activation only)
router.delete('/:id', auth, authorizeLease, async (req, res, next) => {
  try {
    if (String(req.lease.landlord_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Only the landlord can cancel a lease' });
    }
    if (req.lease.status !== 'pending') {
      return res.status(409).json({ error: 'Only pending leases can be cancelled' });
    }
    const { rows } = await Lease.cancel(req.lease.id);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
