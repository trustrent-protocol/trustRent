const pool = require('../pool');

const create = (data) =>
  pool.query(
    `INSERT INTO disputes (lease_id, raised_by, reason, evidence)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [
      data.lease_id,
      data.raised_by,
      data.reason,
      data.evidence ? JSON.stringify(data.evidence) : null,
    ],
  );

const findById = (id) => pool.query('SELECT * FROM disputes WHERE id = $1', [id]);

const findByLease = (lease_id) =>
  pool.query('SELECT * FROM disputes WHERE lease_id = $1 ORDER BY created_at DESC', [lease_id]);

const resolve = (id, tenant_share_pct, resolved_by, resolution_note) =>
  pool.query(
    `UPDATE disputes
     SET status = 'resolved', tenant_share_pct = $1, resolved_by = $2,
         resolution_note = $3, updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [tenant_share_pct, resolved_by, resolution_note, id],
  );

module.exports = { create, findById, findByLease, resolve };
