/**
 * Notifications service tests: webhook payloads are correct, failures are
 * swallowed (notifications must never break the payment lifecycle), and the
 * service is a no-op without a WEBHOOK_URL.
 */

const notifications = require('../../src/services/notifications');

const ORIGINAL_URL = process.env.WEBHOOK_URL;

let fetchMock;

beforeAll(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.clearAllMocks();
  if (ORIGINAL_URL === undefined) delete process.env.WEBHOOK_URL;
  else process.env.WEBHOOK_URL = ORIGINAL_URL;
});

describe('notifyPaymentConfirmed', () => {
  test('posts a structured webhook payload', async () => {
    process.env.WEBHOOK_URL = 'https://hooks.example/trustrent';
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await notifications.notifyPaymentConfirmed({ leaseId: 'L1', txHash: 'tx', amount: '500.0000000' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example/trustrent');
    expect(JSON.parse(init.body)).toMatchObject({
      event: 'payment.confirmed',
      data: { leaseId: 'L1', txHash: 'tx', amount: '500.0000000' },
    });
  });

  test('does nothing when no webhook is configured', async () => {
    delete process.env.WEBHOOK_URL;
    await notifications.notifyPaymentConfirmed({ leaseId: 'L1', txHash: 'tx', amount: '1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('swallows transport errors so the caller never throws', async () => {
    process.env.WEBHOOK_URL = 'https://hooks.example/trustrent';
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(
      notifications.notifyPaymentConfirmed({ leaseId: 'L1', txHash: 'tx', amount: '1' }),
    ).resolves.toBeUndefined();
  });

  test('logs a non-2xx webhook response without throwing', async () => {
    process.env.WEBHOOK_URL = 'https://hooks.example/trustrent';
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(
      notifications.notifyLeaseActivated({ leaseId: 'L1' }),
    ).resolves.toBeUndefined();
  });

  test('exposes the remaining notification channels', async () => {
    process.env.WEBHOOK_URL = 'https://hooks.example/trustrent';
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await notifications.notifyDisputeOpened({ leaseId: 'L1', disputeId: 'D1' });
    await notifications.notifyDepositReleased({ leaseId: 'L1', tenant: 'T', landlord: 'L', kind: 'split' });

    const events = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).event);
    expect(events).toEqual(['dispute.opened', 'deposit.released']);
  });
});