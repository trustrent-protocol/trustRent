const Lease = require('../../db/models/lease');

/**
 * Scopes a lease-scoped route to callers involved in the lease.
 *
 * Loads the lease, attaches it to `req.lease`, and rejects callers who are
 * neither landlord, tenant, nor agent. The lease id is read from
 * `req.params.id` or, when that is absent, `req.body.lease_id`.
 */
async function authorizeLease(req, res, next) {
  const id = req.params.id || req.params.leaseId || req.body.lease_id;
  try {
    const { rows } = await Lease.findById(id);
    const lease = rows[0];
    if (!lease) return res.status(404).json({ error: 'Lease not found' });

    const involved = [lease.landlord_id, lease.tenant_id, lease.agent_id]
      .filter(Boolean)
      .map(String);
    if (!involved.includes(String(req.user.id))) {
      return res.status(403).json({ error: 'You are not a party to this lease' });
    }

    req.lease = lease;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authorizeLease };
