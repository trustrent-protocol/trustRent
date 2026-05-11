/**
 * Dispute service — placeholder for v0.2.
 * Will handle evidence submission, arbitrator notification,
 * and co-signed deposit release decisions.
 */

async function openDispute({ leaseId, raisedBy, reason, evidence }) {
  // TODO v0.2: persist dispute, notify arbitrator, lock escrow
  throw new Error('Dispute flow not yet implemented');
}

async function resolveDispute({ disputeId, decision, arbitratorSecretKey }) {
  // TODO v0.2: co-sign escrow release with arbitrator key
  throw new Error('Dispute resolution not yet implemented');
}

module.exports = { openDispute, resolveDispute };
