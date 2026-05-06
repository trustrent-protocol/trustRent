const {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
  AuthClawbackEnabledFlag,
} = require('@stellar/stellar-sdk');
const { server, networkPassphrase } = require('./client');

/**
 * Create a multi-sig escrow account for a lease deposit.
 *
 * @param {object} opts
 * @param {string} opts.tenantPublicKey
 * @param {string} opts.landlordPublicKey
 * @param {string} opts.arbitratorPublicKey  defaults to env ARBITRATOR_PUBLIC_KEY
 * @param {string} opts.amount               deposit amount in USDC
 * @param {string} opts.leaseHash            SHA-256 of the lease document
 * @param {string} opts.fundingSecretKey     account that pays the escrow reserve (landlord)
 * @returns {object} { escrowPublicKey, txHash }
 */
async function createEscrow({
  tenantPublicKey,
  landlordPublicKey,
  arbitratorPublicKey = process.env.ARBITRATOR_PUBLIC_KEY,
  amount,
  leaseHash,
  fundingSecretKey,
}) {
  const escrowKeypair = Keypair.random();
  const fundingKeypair = Keypair.fromSecret(fundingSecretKey);
  const fundingAccount = await server.loadAccount(fundingKeypair.publicKey());

  const USDC = new Asset(
    'USDC',
    isTestnet()
      ? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
      : 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
  );

  const tx = new TransactionBuilder(fundingAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    // 1. Create the escrow account with minimum reserve
    .addOperation(Operation.createAccount({
      destination: escrowKeypair.publicKey(),
      startingBalance: '2', // XLM reserve
    }))
    // 2. Add trustline for USDC (escrow account must sign)
    .addOperation(Operation.changeTrust({
      asset: USDC,
      source: escrowKeypair.publicKey(),
    }))
    // 3. Fund escrow with deposit
    .addOperation(Operation.payment({
      destination: escrowKeypair.publicKey(),
      asset: USDC,
      amount,
    }))
    // 4. Set multi-sig: tenant(1) + landlord(1) + arbitrator(1), threshold 2
    .addOperation(Operation.setOptions({
      source: escrowKeypair.publicKey(),
      signer: { ed25519PublicKey: tenantPublicKey, weight: 1 },
    }))
    .addOperation(Operation.setOptions({
      source: escrowKeypair.publicKey(),
      signer: { ed25519PublicKey: landlordPublicKey, weight: 1 },
    }))
    .addOperation(Operation.setOptions({
      source: escrowKeypair.publicKey(),
      signer: { ed25519PublicKey: arbitratorPublicKey, weight: 1 },
      lowThreshold: 1,
      medThreshold: 2,
      highThreshold: 2,
      masterWeight: 0, // disable master key
    }))
    // 5. Anchor lease hash
    .addOperation(Operation.manageData({
      source: escrowKeypair.publicKey(),
      name: 'trustrent:lease',
      value: leaseHash,
    }))
    .addOperation(Operation.manageData({
      source: escrowKeypair.publicKey(),
      name: 'trustrent:tenant',
      value: tenantPublicKey,
    }))
    .addOperation(Operation.manageData({
      source: escrowKeypair.publicKey(),
      name: 'trustrent:landlord',
      value: landlordPublicKey,
    }))
    .setTimeout(30)
    .build();

  tx.sign(fundingKeypair, escrowKeypair);

  const result = await server.submitTransaction(tx);

  return {
    escrowPublicKey: escrowKeypair.publicKey(),
    txHash: result.hash,
  };
}

function isTestnet() {
  return process.env.STELLAR_NETWORK !== 'mainnet';
}

module.exports = { createEscrow };
