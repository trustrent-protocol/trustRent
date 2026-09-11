/**
 * Notifications service.
 * Posts payment/lease events to the configured webhook URL (Node 18+ fetch).
 * Failures are logged and swallowed — notifications must never break the
 * core payment or lease lifecycle.
 */

function webhookPayload(event, data) {
  return {
    event,
    data,
    generated_at: new Date().toISOString(),
  };
}

async function postWebhook(event, data) {
  if (!process.env.WEBHOOK_URL) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(process.env.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(webhookPayload(event, data)),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[notify] webhook ${event} returned ${res.status}`);
    }
  } catch (err) {
    console.error(`[notify] webhook ${event} failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function notifyPaymentConfirmed({ leaseId, txHash, amount }) {
  return postWebhook('payment.confirmed', { leaseId, txHash, amount });
}

function notifyLeaseActivated({ leaseId }) {
  return postWebhook('lease.activated', { leaseId });
}

function notifyDisputeOpened({ leaseId, disputeId }) {
  return postWebhook('dispute.opened', { leaseId, disputeId });
}

function notifyDepositReleased({ leaseId, tenant, landlord, kind }) {
  return postWebhook('deposit.released', { leaseId, tenant, landlord, kind });
}

module.exports = {
  notifyPaymentConfirmed,
  notifyLeaseActivated,
  notifyDisputeOpened,
  notifyDepositReleased,
};
