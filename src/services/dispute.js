/**
 * Dispute and deposit-release service (v0.2).
 *
 * Handles the off-chain deposit lifecycle: opening a dispute with evidence,
 * computing the agreed/arbitrated deposit split as exact integer math, and
 * producing the release plan used to return the escrow to tenant and landlord.
 * The actual multi-sig release transaction is confirmed on Stellar by the
 * signing service; the server records the decision.
 */

const Dispute = require('../db/models/dispute');
const { scale, sub } = require('../lib/money');

function assertTenantShare(tenantSharePct) {
  const pct = Number(tenantSharePct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    const err = new Error('tenant_share_pct must be a number between 0 and 100');
    err.status = 422;
    throw err;
  }
  return pct;
}

/**
 * Split a deposit between tenant and landlord as exact integer math.
 * The tenant receives `tenantSharePct`% and the landlord receives the rest;
 * tenant and landlord amounts always sum exactly to the deposit.
 *
 * @param {string} depositAmount     deposit as a money string
 * @param {number} tenantSharePct    0-100
 * @returns {{ tenant: string, landlord: string, total: string, tenant_share_pct: number, kind: 'full'|'split' }}
 */
function computeSplit(depositAmount, tenantSharePct) {
  const pct = assertTenantShare(tenantSharePct);
  const tenant = scale(depositAmount, Math.round(pct * 100), 10000);
  const landlord = sub(depositAmount, tenant);
  return {
    tenant,
    landlord,
    total: sub(depositAmount, '0'), // normalized money string
    tenant_share_pct: pct,
    kind: pct === 100 ? 'full' : 'split',
  };
}

/**
 * Open a dispute for a lease.
 * @param {object} opts
 * @param {string} opts.leaseId
 * @param {string} opts.raisedBy   user id of the disputant
 * @param {string} opts.reason     human-readable reason (min 10 chars)
 * @param {object} [opts.evidence] structured evidence (receipts, photos, URLs)
 * @returns {Promise<object>} persisted dispute row
 */
async function openDispute({ leaseId, raisedBy, reason, evidence }) {
  if (typeof reason !== 'string' || reason.trim().length < 10) {
    const err = new Error('reason is required and must be at least 10 characters');
    err.status = 422;
    throw err;
  }
  const { rows } = await Dispute.create({
    lease_id: leaseId,
    raised_by: raisedBy,
    reason: reason.trim(),
    evidence,
  });
  return rows[0];
}

/**
 * Produce the deposit release plan for a settled lease-end. Requires the lease
 * to be active with a locked escrow account.
 *
 * @param {object} opts
 * @param {object} opts.lease            lease row (must have `status`, `escrow_account_pk`, `deposit_amount`)
 * @param {number} [opts.tenantSharePct=100]
 * @param {string} [opts.resolutionNote]
 * @param {string} [opts.resolvedBy]     user id approving the release
 * @returns {Promise<object>} release plan
 */
async function resolveDeposit({ lease, tenantSharePct = 100, resolutionNote, resolvedBy }) {
  if (lease.status !== 'active') {
    const err = new Error('Deposit can only be released from an active lease');
    err.status = 409;
    throw err;
  }
  if (!lease.escrow_account_pk) {
    const err = new Error('No escrow account locked for this lease');
    err.status = 409;
    throw err;
  }
  const split = computeSplit(lease.deposit_amount, tenantSharePct);
  return {
    ...split,
    escrow_account_pk: lease.escrow_account_pk,
    resolution_note: resolutionNote || null,
    resolved_by: resolvedBy || null,
  };
}

/**
 * Record a dispute resolution decision (arbitrator or landlord/tenant
 * agreement) on the persisted dispute.
 * @returns {Promise<object>} updated dispute row
 */
async function resolveDispute({ disputeId, tenantSharePct, resolutionNote, resolvedBy }) {
  assertTenantShare(tenantSharePct);
  const { rows } = await Dispute.resolve(
    disputeId,
    Math.round(Number(tenantSharePct)),
    resolvedBy || null,
    resolutionNote || null,
  );
  if (!rows[0]) {
    const err = new Error('Dispute not found');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

module.exports = { computeSplit, openDispute, resolveDeposit, resolveDispute };
