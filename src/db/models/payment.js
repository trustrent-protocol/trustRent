const pool = require('../pool');

const create = (data) =>
  pool.query(
    `INSERT INTO payments (lease_id, amount, asset, memo, tx_hash, ledger, status, splits, settled_at, idempotency_key)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
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
      data.idempotency_key || null,
    ],
  );

const findByLease = (lease_id) =>
  pool.query('SELECT * FROM payments WHERE lease_id = $1 ORDER BY created_at DESC', [lease_id]);

const findByTxHash = (tx_hash) =>
  pool.query('SELECT * FROM payments WHERE tx_hash = $1', [tx_hash]);

const findByIdempotency = (lease_id, idempotency_key) =>
  pool.query('SELECT * FROM payments WHERE lease_id = $1 AND idempotency_key = $2', [
    lease_id,
    idempotency_key,
  ]);

const confirm = (id, tx_hash, ledger, splits, settled_at) =>
  pool.query(
    `UPDATE payments SET status='confirmed', tx_hash=$1, ledger=$2, splits=$3, settled_at=$4
   WHERE id=$5 RETURNING *`,
    [tx_hash, ledger, JSON.stringify(splits), settled_at, id],
  );

const markFailed = (id, error) =>
  pool.query(
    `UPDATE payments SET status='failed', error=$1, updated_at=NOW()
   WHERE id=$2 AND status='pending' RETURNING *`,
    [error, id],
  );

module.exports = { create, findByLease, findByTxHash, findByIdempotency, confirm, markFailed };
