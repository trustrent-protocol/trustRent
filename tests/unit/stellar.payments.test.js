/**
 * Stellar rent-payment submission tests. The Horizon client is mocked so we
 * can assert exactly what transaction gets built for a given rent amount,
 * commission split, and memo — including byte-safe memo truncation.
 */

jest.mock('../../src/stellar/client', () => {
  const { Asset, Keypair } = require('@stellar/stellar-sdk');
  const ISSUER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 42)).publicKey();
  return {
    server: {
      loadAccount: jest.fn(),
      submitTransaction: jest.fn(),
    },
    networkPassphrase: 'Test SDF Network ; September 2015',
    getAsset: jest.fn((code) => new Asset(code, ISSUER)),
  };
});

const { Account, Keypair } = require('@stellar/stellar-sdk');
const { server } = require('../../src/stellar/client');
const { submitRentPayment } = require('../../src/stellar/payments');

const TENANT = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));
const LANDLORD = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 8)).publicKey();
const AGENT = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 9)).publicKey();

function mockLedger() {
  server.loadAccount.mockResolvedValue(new Account(TENANT.publicKey(), '123456'));
  server.submitTransaction.mockImplementation(() => Promise.resolve({ hash: 'abc', ledger: 42 }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLedger();
});

describe('submitRentPayment', () => {
  test('pays the landlord in full when there is no agent', async () => {
    const result = await submitRentPayment({
      tenantSecretKey: TENANT.secret(),
      landlordPublicKey: LANDLORD,
      agentPublicKey: null,
      amount: '500',
      memo: 'jan',
      asset: 'USDC',
    });

    const tx = server.submitTransaction.mock.calls[0][0];
    expect(tx.operations).toHaveLength(1);
    expect(tx.operations[0].type).toBe('payment');
    expect(tx.operations[0].destination).toBe(LANDLORD);
    expect(tx.operations[0].amount).toBe('500.0000000');

    expect(result.txHash).toBe('abc');
    expect(result.ledger).toBe(42);
    expect(result.settledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.splits).toEqual([{ recipient: 'landlord', amount: '500', asset: 'USDC' }]);
  });

  test('splits the amount between landlord and agent for a commission', async () => {
    await submitRentPayment({
      tenantSecretKey: TENANT.secret(),
      landlordPublicKey: LANDLORD,
      agentPublicKey: AGENT,
      amount: '500',
      agentFeePct: 7,
      memo: 'jan',
    });

    const tx = server.submitTransaction.mock.calls[0][0];
    expect(tx.operations).toHaveLength(2);
    expect(tx.operations[0].destination).toBe(LANDLORD);
    expect(tx.operations[0].amount).toBe('465.0000000');
    expect(tx.operations[1].destination).toBe(AGENT);
    expect(tx.operations[1].amount).toBe('35.0000000');
  });

  test('omits a zero-valued agent leg even when an agent key is provided', async () => {
    await submitRentPayment({
      tenantSecretKey: TENANT.secret(),
      landlordPublicKey: LANDLORD,
      agentPublicKey: AGENT,
      amount: '500',
      agentFeePct: 0,
      memo: 'jan',
    });

    const tx = server.submitTransaction.mock.calls[0][0];
    expect(tx.operations).toHaveLength(1);
    expect(tx.operations[0].destination).toBe(LANDLORD);
    expect(tx.operations[0].amount).toBe('500.0000000');
  });

  test('truncates the memo to 28 UTF-8 bytes', async () => {
    await submitRentPayment({
      tenantSecretKey: TENANT.secret(),
      landlordPublicKey: LANDLORD,
      amount: '500',
      memo: 'y'.repeat(120),
    });

    const tx = server.submitTransaction.mock.calls[0][0];
    expect(Buffer.byteLength(tx.memo.value, 'utf8')).toBe(28);
  });

  test('does not attach a memo when none is supplied', async () => {
    await submitRentPayment({
      tenantSecretKey: TENANT.secret(),
      landlordPublicKey: LANDLORD,
      amount: '500',
    });

    const tx = server.submitTransaction.mock.calls[0][0];
    expect(tx.memo.type).toBe('none');
  });
});
