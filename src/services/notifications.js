/**
 * Notifications service — placeholder for v0.2.
 * Will send email and webhook notifications for payment events,
 * lease status changes, and dispute updates.
 */

async function notifyPaymentConfirmed({ leaseId, txHash, amount }) {
  if (!process.env.WEBHOOK_URL) return;
  // TODO v0.2: POST to WEBHOOK_URL
  console.log(`[notify] Payment confirmed: ${txHash} for lease ${leaseId}`);
}

async function notifyLeaseActivated({ leaseId }) {
  console.log(`[notify] Lease activated: ${leaseId}`);
}

module.exports = { notifyPaymentConfirmed, notifyLeaseActivated };
