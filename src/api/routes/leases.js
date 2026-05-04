const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const Lease = require('../../db/models/lease');

// POST /api/v1/leases
router.post('/',
  auth,
  body('tenant_id').isUUID(),
  body('property_address').notEmpty(),
  body('rent_amount').isNumeric(),
  body('deposit_amount').isNumeric(),
  body('starts_at').isISO8601(),
  body('ends_at').isISO8601(),
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
  }
);

// GET /api/v1/leases/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await Lease.findById(req.params.id);
    if (!rows[0]) return res.status(404).json({ error: 'Lease not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/leases/:id
router.patch('/:id',
  auth,
  body('status').isIn(['pending', 'active', 'ended', 'cancelled']),
  validate,
  async (req, res, next) => {
    try {
      const { rows } = await Lease.updateStatus(req.params.id, req.body.status);
      if (!rows[0]) return res.status(404).json({ error: 'Lease not found' });
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/leases/:id  (pre-activation only)
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { rows: existing } = await Lease.findById(req.params.id);
    if (!existing[0]) return res.status(404).json({ error: 'Lease not found' });
    if (existing[0].status !== 'pending') {
      return res.status(409).json({ error: 'Only pending leases can be cancelled' });
    }
    const { rows } = await Lease.cancel(req.params.id);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
