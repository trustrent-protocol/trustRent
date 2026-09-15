/**
 * Stellar memo helpers.
 *
 * `Memo.text` is limited to 28 *bytes*. Slicing a string by character length
 * (as was done previously) can silently produce a memo that exceeds the byte
 * limit for multi-byte (non-ASCII) input, failing submission with an opaque
 * Horizon error. These helpers truncate by UTF-8 byte length instead.
 */

const MAX_MEMO_BYTES = 28;

const TRUSTRENT_PREFIX = 'trustrent:';

/** Trim `text` to at most `maxBytes` UTF-8 bytes, keeping it valid UTF-8. */
function truncateToBytes(text, maxBytes = MAX_MEMO_BYTES) {
  let out = String(text ?? '');
  while (Buffer.byteLength(out, 'utf8') > maxBytes) {
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * Deterministic short tag for a lease, derived from its UUID. The full 36-char
 * UUID cannot fit inside the 28-byte Stellar memo alongside the `trustrent:`
 * prefix, so we use the last 48 bits (12 hex chars). Collisions across the
 * lifetime of a rental platform are negligible; the on-chain indexer resolves
 * the tag back to the lease when it ingests a payment.
 */
function leaseMemoTag(leaseId) {
  return String(leaseId).replace(/-/g, '').toLowerCase().slice(-12);
}

/**
 * Build the on-chain memo for a rent payment: a `trustrent:<leaseTag>` prefix
 * (which the indexer uses to correlate a payment to its lease) plus an
 * optional human-readable suffix, truncated to the Stellar byte limit.
 *
 * @param {string} leaseId
 * @param {string} [extra]
 */
function buildLeaseMemo(leaseId, extra) {
  const prefix = `${TRUSTRENT_PREFIX}${leaseMemoTag(leaseId)}`;
  if (!extra) return prefix;
  return truncateToBytes(`${prefix} ${extra}`);
}

module.exports = {
  truncateToBytes,
  buildLeaseMemo,
  leaseMemoTag,
  TRUSTRENT_PREFIX,
  MAX_MEMO_BYTES,
};
