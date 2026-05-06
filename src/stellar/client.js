const { Horizon, Networks } = require('@stellar/stellar-sdk');

const isTestnet = process.env.STELLAR_NETWORK !== 'mainnet';

const server = new Horizon.Server(
  process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
);

const networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;

module.exports = { server, networkPassphrase, isTestnet };
