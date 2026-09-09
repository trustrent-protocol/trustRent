const pool = require('../pool');

const create = (data) =>
  pool.query(
    `INSERT INTO payments (lease_id, amount, asset, memo, tx_hash, ledger, status, splits, settled_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      data.lease_id,
      data.amount,
      data.asset || 'USDC',
      data.memo || null,
      data.tx_hash || null,
      data.ledger || null,
      data.status || 'pending',
      data.splits ? JSON.stringify(data.splits) : null,
      data.settled_at || null,
    ],
  );

const findByLease = (lease_id) =>
  pool.query('SELECT * FROM payments WHERE lease_id = $1 ORDER BY created_at DESC', [lease_id]);

const findByTxHash = (tx_hash) =>
  pool.query('SELECT * FROM payments WHERE tx_hash = $1', [tx_hash]);

const confirm = (id, tx_hash, ledger, splits, settled_at) =>
  pool.query(
    `UPDATE payments SET status='confirmed', tx_hash=$1, ledger=$2, splits=$3, settled_at=$4
   WHERE id=$5 RETURNING *`,
    [tx_hash, ledger, JSON.stringify(splits), settled_at, id],
  );

module.exports = { create, findByLease, findByTxHash, confirm };
