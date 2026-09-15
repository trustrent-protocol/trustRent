/**
 * Stellar escrow creation tests. Horizon is mocked so we can assert the ops
 * that build the 2-of-3 multi-sig escrow: reserve funding, USDC trustline,
 * deposit, signer weights/thresholds, and anchored lease data entries.
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
    getUSDC: jest.fn(() => new Asset('USDC', ISSUER)),
  };
});

const { Account, Keypair } = require('@stellar/stellar-sdk');
const { server } = require('../../src/stellar/client');
const { createEscrow } = require('../../src/stellar/escrow');

const FUNDER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 9));
const TENANT = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 11)).publicKey();
const LANDLORD = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 12)).publicKey();
const ARBITRATOR = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 13)).publicKey();

beforeEach(() => {
  jest.clearAllMocks();
  server.loadAccount.mockResolvedValue(new Account(FUNDER.publicKey(), '1'));
  server.submitTransaction.mockImplementation(() =>
    Promise.resolve({ hash: 'escrow-tx', ledger: 7 }),
  );
});

describe('createEscrow', () => {
  test('builds a fully configured multi-sig escrow transaction', async () => {
    const result = await createEscrow({
      tenantPublicKey: TENANT,
      landlordPublicKey: LANDLORD,
      arbitratorPublicKey: ARBITRATOR,
      amount: '1000.00',
      leaseHash: 'sha256:abc',
      fundingSecretKey: FUNDER.secret(),
    });

    const tx = server.submitTransaction.mock.calls[0][0];
    const ops = tx.operations;

    // 1 funding/reserve, 1 trustline, 1 deposit funding, 3+ setOptions, 3 manageData
    expect(ops[0].type).toBe('createAccount');
    expect(ops[0].destination).toBe(result.escrowPublicKey);
    // Minimum XLM reserve for the spawned escrow account.
    expect(ops[0].startingBalance).toBe('2.0000000');

    expect(ops[1].type).toBe('changeTrust');
    // Trustline source must be the escrow account itself.
    expect(ops[1].source).toBe(result.escrowPublicKey);

    expect(ops[2].type).toBe('payment');
    expect(ops[2].amount).toBe('1000.0000000');

    const setOptions = ops.filter((op) => op.type === 'setOptions');
    expect(setOptions).toHaveLength(3);
    const thresholds = setOptions.find((op) => op.lowThreshold === 1);
    expect(thresholds).toBeDefined();
    expect(thresholds.medThreshold).toBe(2);
    expect(thresholds.highThreshold).toBe(2);
    expect(thresholds.masterWeight).toBe(0);

    // Signers: tenant + landlord + arbitrator, each weight 1 (2-of-3 threshold).
    const signerKeys = setOptions.map((op) => op.signer && op.signer.ed25519PublicKey);
    expect(signerKeys).toEqual(expect.arrayContaining([TENANT, LANDLORD, ARBITRATOR]));

    const data = ops.filter((op) => op.type === 'manageData');
    const leaseData = data.find((op) => op.name === 'trustrent:lease');
    expect(leaseData).toBeDefined();
    expect(Buffer.from(leaseData.value).toString('utf8')).toBe('sha256:abc');
    expect(data.map((op) => op.source)).toEqual(expect.arrayContaining([result.escrowPublicKey]));

    expect(result.txHash).toBe('escrow-tx');
  });

  test('defaults the arbitrator to the configured environment key', async () => {
    const ARB = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 99)).publicKey();
    process.env.ARBITRATOR_PUBLIC_KEY = ARB;
    await createEscrow({
      tenantPublicKey: TENANT,
      landlordPublicKey: LANDLORD,
      amount: '1000.00',
      leaseHash: 'sha256:abc',
      fundingSecretKey: FUNDER.secret(),
    });
    delete process.env.ARBITRATOR_PUBLIC_KEY;

    const tx = server.submitTransaction.mock.calls[0][0];
    const signers = tx.operations
      .filter((op) => op.type === 'setOptions')
      .map((op) => op.signer && op.signer.ed25519PublicKey);
    expect(signers).toEqual(expect.arrayContaining([ARB]));
  });
});
