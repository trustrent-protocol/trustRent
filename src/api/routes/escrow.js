const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const { authorizeLease } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const Lease = require('../../db/models/lease');
const Dispute = require('../../db/models/dispute');
const { createEscrow } = require('../../stellar/escrow');
const { openDispute, resolveDeposit, resolveDispute } = require('../../services/dispute');
const {
  notifyLeaseActivated,
  notifyDisputeOpened,
  notifyDepositReleased,
} = require('../../services/notifications');

// POST /api/v1/escrow  — create escrow account for a lease
router.post(
  '/',
  auth,
  authorizeLease,
  body('lease_id').isUUID(),
  body('funding_secret_key').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { lease_id, funding_secret_key } = req.body;
      // TODO: secret key should never travel over the wire in production.
      // Will be replaced by a signing service in v0.2.
      const lease = req.lease;
      if (String(lease.landlord_id) !== String(req.user.id)) {
        return res.status(403).json({ error: 'Only the landlord can fund an escrow' });
      }
      if (lease.escrow_account_pk) {
        return res.status(409).json({ error: 'Escrow already exists for this lease' });
      }

      // Resolve tenant and landlord stellar keys from DB
      const pool = require('../../db/pool');
      const { rows: users } = await pool.query(
        'SELECT id, stellar_pk FROM users WHERE id = ANY($1)',
        [[lease.tenant_id, lease.landlord_id]],
      );
      const byId = Object.fromEntries(users.map((u) => [u.id, u.stellar_pk]));

      const { escrowPublicKey, txHash } = await createEscrow({
        tenantPublicKey: byId[lease.tenant_id],
        landlordPublicKey: byId[lease.landlord_id],
        amount: lease.deposit_amount,
        leaseHash: lease.lease_hash || 'pending',
        fundingSecretKey: funding_secret_key,
      });

      await Lease.setEscrowAccount(lease_id, escrowPublicKey);
      await Lease.updateStatus(lease_id, 'active');
      notifyLeaseActivated({ leaseId: lease_id });

      res.status(201).json({ escrow_account_pk: escrowPublicKey, tx_hash: txHash });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/escrow/:leaseId
router.get('/:leaseId', auth, authorizeLease, async (req, res, next) => {
  try {
    const lease = req.lease;
    if (!lease.escrow_account_pk) {
      return res.status(404).json({ error: 'No escrow account for this lease' });
    }

    const { server } = require('../../stellar/client');
    const account = await server.loadAccount(lease.escrow_account_pk);
    const usdcBalance = account.balances.find((b) => b.asset_code === 'USDC');

    res.json({
      escrow_account_pk: lease.escrow_account_pk,
      balance: usdcBalance ? usdcBalance.balance : '0',
      asset: 'USDC',
      signers: account.signers,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/escrow/:leaseId/dispute  — open a deposit dispute
router.post(
  '/:leaseId/dispute',
  auth,
  authorizeLease,
  body('reason').isString().isLength({ min: 10, max: 2000 }),
  body('evidence').optional().isObject(),
  validate,
  async (req, res, next) => {
    try {
      const lease = req.lease;
      const disputants = [lease.landlord_id, lease.tenant_id].map(String);
      if (!disputants.includes(String(req.user.id))) {
        return res.status(403).json({ error: 'Only the tenant or landlord can open a dispute' });
      }
      if (!lease.escrow_account_pk) {
        return res.status(409).json({ error: 'No escrow account locked for this lease' });
      }

      const dispute = await openDispute({
        leaseId: lease.id,
        raisedBy: req.user.id,
        reason: req.body.reason,
        evidence: req.body.evidence,
      });
      notifyDisputeOpened({ leaseId: lease.id, disputeId: dispute.id });
      res.status(201).json(dispute);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/escrow/:leaseId/disputes — list disputes for a lease
router.get('/:leaseId/disputes', auth, authorizeLease, async (req, res, next) => {
  try {
    const { rows } = await Dispute.findByLease(req.lease.id);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/escrow/:leaseId/release  — release the deposit and end the lease
router.post(
  '/:leaseId/release',
  auth,
  authorizeLease,
  body('tenant_share_pct').optional({ values: 'null' }).isFloat({ min: 0, max: 100 }),
  body('resolution_note').optional().isString().isLength({ max: 2000 }),
  validate,
  async (req, res, next) => {
    try {
      const lease = req.lease;
      const parties = [lease.landlord_id, lease.tenant_id].map(String);
      if (!parties.includes(String(req.user.id))) {
        return res
          .status(403)
          .json({ error: 'Only the tenant or landlord can release the deposit' });
      }

      const plan = await resolveDeposit({
        lease,
        tenantSharePct: req.body.tenant_share_pct ?? 100,
        resolutionNote: req.body.resolution_note,
        resolvedBy: req.user.id,
      });

      await Lease.updateStatus(lease.id, 'ended');
      notifyDepositReleased({
        leaseId: lease.id,
        tenant: plan.tenant,
        landlord: plan.landlord,
        kind: plan.kind,
      });
      res.json(plan);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/escrow/:leaseId/disputes/:disputeId/resolve  — record an agreement/arbitration
router.post(
  '/:leaseId/disputes/:disputeId/resolve',
  auth,
  authorizeLease,
  body('tenant_share_pct').isFloat({ min: 0, max: 100 }),
  body('resolution_note').optional().isString().isLength({ max: 2000 }),
  validate,
  async (req, res, next) => {
    try {
      const lease = req.lease;
      const parties = [lease.landlord_id, lease.tenant_id].map(String);
      if (!parties.includes(String(req.user.id))) {
        return res.status(403).json({ error: 'Only the tenant or landlord can resolve a dispute' });
      }

      const { rows } = await Dispute.findById(req.params.disputeId);
      if (!rows[0] || String(rows[0].lease_id) !== String(lease.id)) {
        return res.status(404).json({ error: 'Dispute not found for this lease' });
      }

      const dispute = await resolveDispute({
        disputeId: req.params.disputeId,
        tenantSharePct: req.body.tenant_share_pct,
        resolutionNote: req.body.resolution_note,
        resolvedBy: req.user.id,
      });
      res.json(dispute);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
