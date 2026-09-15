require('dotenv').config();
const { server } = require('./client');
const pool = require('../db/pool');
const { notifyPaymentConfirmed } = require('../services/notifications');
const { supportedAssets } = require('../lib/assets');
const { TRUSTRENT_PREFIX, leaseMemoTag } = require('../lib/memo');
const { eq: moneyEquals } = require('../lib/money');

const STARTUP_RETRY_MS = 60_000;
const STREAM_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * Load the accounts the indexer should watch and, for each, the leases a rent
 * payment landing on that account could settle.
 *
 * Rent payments move tenant -> landlord (and -> agent for commission), so we
 * watch those recipient accounts — NOT the escrow account. The escrow deposit
 * is a payment *into* escrow and would otherwise be double-recorded as rent.
 *
 * @returns {Promise<Array<{account: string, leases: Array<{lease_id, rent_amount}>}>>}
 */
async function loadWatchList() {
  const { rows } = await pool.query(
    `SELECT l.id AS lease_id, l.rent_amount, u.stellar_pk
       FROM leases l
       JOIN users u ON u.id = l.landlord_id
      WHERE l.status = 'active' AND u.stellar_pk IS NOT NULL
      UNION
     SELECT l.id AS lease_id, l.rent_amount, u.stellar_pk
       FROM leases l
       JOIN users u ON u.id = l.agent_id
      WHERE l.status = 'active'
        AND l.agent_id IS NOT NULL
        AND u.stellar_pk IS NOT NULL`,
  );

  const byAccount = new Map();
  for (const row of rows) {
    if (!byAccount.has(row.stellar_pk)) byAccount.set(row.stellar_pk, []);
    byAccount.get(row.stellar_pk).push({
      lease_id: row.lease_id,
      rent_amount: row.rent_amount,
      tag: leaseMemoTag(row.lease_id),
    });
  }

  return [...byAccount.entries()].map(([account, leases]) => ({ account, leases }));
}

/** Read the persisted Horizon cursor for an account, defaulting to 'now'. */
async function loadCursor(accountId) {
  const { rows } = await pool.query('SELECT cursor FROM indexer_cursors WHERE account_id = $1', [
    accountId,
  ]);
  return rows[0] ? rows[0].cursor : 'now';
}

/** Persist a cursor so a restart resumes from where we were, losing nothing. */
async function saveCursor(accountId, cursor) {
  await pool.query(
    `INSERT INTO indexer_cursors (account_id, cursor)
     VALUES ($1, $2)
     ON CONFLICT (account_id) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = NOW()`,
    [accountId, cursor],
  );
}

/** Extract the raw text of a Horizon payment memo (object or string). */
function memoText(payment) {
  const memo = payment.memo;
  if (!memo) return null;
  if (typeof memo === 'string') return memo;
  if (typeof memo === 'object' && typeof memo.value === 'string') return memo.value;
  return null;
}

/**
 * Match an incoming payment to the lease it settles, using the
 * `trustrent:<tag>` memo stamped by the API on submission.
 *
 * @param {object} payment
 * @param {Array} leases  [{lease_id, rent_amount, tag}] for the watched account
 * @returns {object|null} matched { lease_id, rent_amount } or null
 */
function matchLease(payment, leases) {
  const memo = memoText(payment);
  if (!memo || !memo.startsWith(`${TRUSTRENT_PREFIX}`)) return null;
  const body = memo.slice(TRUSTRENT_PREFIX.length);
  const tag = body.split(' ')[0];
  return leases.find((l) => l.tag === tag) || null;
}

/**
 * Record a confirmed on-chain payment, adjusting only the payments ledger.
 * Skips payments that are not trustRent-stamped, are already indexed, or whose
 * amount does not match the lease's scheduled rent (would corrupt accounting).
 *
 * @returns {Promise<'indexed'|'skipped'|'already-indexed'>}
 */
async function indexPayment({ payment, accountId, leases }) {
  if (payment.type !== 'payment') return 'skipped';

  const asset = payment.asset_code || '';
  if (!supportedAssets().includes(asset)) {
    console.warn(
      `[indexer] Ignoring payment ${payment.transaction_hash}: unsupported asset ${asset}`,
    );
    return 'skipped';
  }

  const lease = matchLease(payment, leases);
  if (!lease) {
    console.warn(
      `[indexer] Ignoring payment ${payment.transaction_hash}: ` +
        `no trustrent memo tag matching account ${accountId}`,
    );
    return 'skipped';
  }

  if (!moneyEquals(payment.amount, lease.rent_amount)) {
    console.warn(
      `[indexer] Ignoring payment ${payment.transaction_hash} for lease ` +
        `${lease.lease_id}: amount ${payment.amount} != rent ${lease.rent_amount}`,
    );
    return 'skipped';
  }

  const existing = await pool.query('SELECT id FROM payments WHERE tx_hash = $1', [
    payment.transaction_hash,
  ]);
  if (existing.rows.length > 0) return 'already-indexed';

  await pool.query(
    `INSERT INTO payments (lease_id, amount, asset, tx_hash, ledger, status, settled_at)
     VALUES ($1, $2, $3, $4, $5, 'confirmed', $6)
     ON CONFLICT (tx_hash) DO NOTHING`,
    [
      lease.lease_id,
      payment.amount,
      asset,
      payment.transaction_hash,
      payment.ledger,
      payment.created_at,
    ],
  );

  notifyPaymentConfirmed({
    leaseId: lease.lease_id,
    txHash: payment.transaction_hash,
    amount: payment.amount,
  });

  return 'indexed';
}

/**
 * Open a live payments stream for one account, persisting the cursor after
 * every message and reconnecting with exponential backoff on any error/close
 * so that no payment is ever lost to a transient outage.
 */
async function watchAccount({ account, leases }, attempt = 0) {
  const cursor = await loadCursor(account);
  console.log(`[indexer] Watching ${account} for ${leases.length} lease(s) from cursor ${cursor}`);

  let closed = false;
  const reconnect = (reason) => {
    if (closed) return;
    closed = true;
    const delay = Math.min(STREAM_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    console.error(`[indexer] Stream for ${account} ${reason}. Reconnecting in ${delay}ms...`);
    setTimeout(
      () => watchAccount({ account, leases }, Math.min(attempt + 1, 10)).catch(reportFatal),
      delay,
    );
  };

  server
    .payments()
    .forAccount(account)
    .cursor(cursor)
    .stream({
      onmessage: async (payment) => {
        try {
          const outcome = await indexPayment({ payment, accountId: account, leases });
          await saveCursor(account, payment.paging_token);
          if (outcome === 'indexed') {
            console.log(
              `[indexer] Indexed payment ${payment.transaction_hash} from cursor ${cursor}`,
            );
          }
        } catch (err) {
          console.error(`[indexer] Failed recording ${payment.transaction_hash}:`, err.message);
        }
      },
      onerror: (err) => {
        console.error(`[indexer] Stream error for ${account}:`, err && err.message);
        reconnect('stream errored');
      },
      onclose: () => reconnect('stream closed'),
    });
}

function reportFatal(err) {
  console.error('[indexer] Fatal:', err);
  process.exit(1);
}

async function startIndexer() {
  console.log('[indexer] trustRent indexer starting...');

  try {
    const watchList = await loadWatchList();
    if (watchList.length === 0) {
      console.log('[indexer] No active leases to watch. Retrying in 60s...');
      setTimeout(() => startIndexer().catch(reportFatal), STARTUP_RETRY_MS);
      return;
    }
    for (const entry of watchList) {
      watchAccount(entry).catch(reportFatal);
    }
  } catch (err) {
    console.error('[indexer] DB unavailable, retrying in 60s:', err.message);
    setTimeout(() => startIndexer().catch(reportFatal), STARTUP_RETRY_MS);
  }
}

// Exported for tests; the process entry point starts the loop directly.
module.exports = {
  startIndexer,
  watchAccount,
  loadWatchList,
  indexPayment,
  matchLease,
  memoText,
  loadCursor,
  saveCursor,
};

if (require.main === module) {
  startIndexer().catch(reportFatal);
}
