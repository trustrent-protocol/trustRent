require('dotenv').config();
const { server } = require('./client');
const pool = require('../db/pool');
const { notifyPaymentConfirmed } = require('../services/notifications');

const TRUSTRENT_MEMO_PREFIX = 'trustrent:';

/**
 * Watch Stellar payments to known lease escrow accounts and sync to DB.
 * Runs as a long-lived process.
 */
async function startIndexer() {
  console.log('trustRent indexer starting...');

  // Load all active escrow accounts from DB
  const { rows: leases } = await pool.query(
    `SELECT id, escrow_account_pk FROM leases
     WHERE status = 'active' AND escrow_account_pk IS NOT NULL`
  );

  if (leases.length === 0) {
    console.log('No active escrow accounts to watch. Retrying in 60s...');
    setTimeout(startIndexer, 60_000);
    return;
  }

  for (const lease of leases) {
    watchAccount(lease.id, lease.escrow_account_pk);
  }
}

function watchAccount(leaseId, accountId) {
  console.log(`Watching escrow account ${accountId} for lease ${leaseId}`);

  server
    .payments()
    .forAccount(accountId)
    .cursor('now')
    .stream({
      onmessage: async (payment) => {
        if (payment.type !== 'payment') return;
        if (payment.asset_code !== 'USDC') return;

        try {
          const existing = await pool.query(
            'SELECT id FROM payments WHERE tx_hash = $1',
            [payment.transaction_hash]
          );
          if (existing.rows.length > 0) return;

          await pool.query(
            `INSERT INTO payments (lease_id, amount, asset, tx_hash, ledger, status, settled_at)
             VALUES ($1, $2, 'USDC', $3, $4, 'confirmed', $5)
             ON CONFLICT (tx_hash) DO NOTHING`,
            [
              leaseId,
              payment.amount,
              payment.transaction_hash,
              payment.ledger, // actual ledger sequence number
              payment.created_at,
            ]
          );
          console.log(`Indexed payment ${payment.transaction_hash} for lease ${leaseId}`);
          notifyPaymentConfirmed({
            leaseId,
            txHash: payment.transaction_hash,
            amount: payment.amount,
          });
        } catch (err) {
          console.error('Indexer error:', err.message);
        }
      },
      onerror: (err) => console.error('Stream error:', err),
    });
}

startIndexer().catch(console.error);
