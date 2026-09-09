const pool = require('../pool');

const create = (data) =>
  pool.query(
    `INSERT INTO leases
     (landlord_id, tenant_id, agent_id, property_address, rent_amount,
      deposit_amount, asset, agent_fee_pct, lease_hash, starts_at, ends_at, duration_months)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      data.landlord_id,
      data.tenant_id,
      data.agent_id || null,
      data.property_address,
      data.rent_amount,
      data.deposit_amount,
      data.asset || 'USDC',
      data.agent_fee_pct || 0,
      data.lease_hash || null,
      data.starts_at,
      data.ends_at,
      data.duration_months,
    ],
  );

const findById = (id) => pool.query('SELECT * FROM leases WHERE id = $1', [id]);

const updateStatus = (id, status) =>
  pool.query(`UPDATE leases SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [
    status,
    id,
  ]);

const setEscrowAccount = (id, escrow_account_pk) =>
  pool.query(
    `UPDATE leases SET escrow_account_pk = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [escrow_account_pk, id],
  );

const cancel = (id) => updateStatus(id, 'cancelled');

module.exports = { create, findById, updateStatus, setEscrowAccount, cancel };
