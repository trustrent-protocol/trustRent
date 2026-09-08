const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const { authorizeLease } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const Lease = require('../../db/models/lease');
const { createEscrow } = require('../../stellar/escrow');
const { notifyLeaseActivated } = require('../../services/notifications');

// POST /api/v1/escrow  — create escrow account for a lease
router.post('/',
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
        [[lease.tenant_id, lease.landlord_id]]
      );
      const byId = Object.fromEntries(users.map(u => [u.id, u.stellar_pk]));

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
  }
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
    const usdcBalance = account.balances.find(b => b.asset_code === 'USDC');

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

// POST /api/v1/escrow/:leaseId/release  — initiate deposit release (stub)
router.post('/:leaseId/release', auth, async (req, res) => {
  res.status(501).json({ message: 'Deposit release flow coming in v0.2' });
});

// POST /api/v1/escrow/:leaseId/dispute  — open a dispute (stub)
router.post('/:leaseId/dispute', auth, async (req, res) => {
  res.status(501).json({ message: 'Dispute flow coming in v0.2' });
});

module.exports = router;
