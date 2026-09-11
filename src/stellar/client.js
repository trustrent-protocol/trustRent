const { Horizon, Networks, Asset } = require('@stellar/stellar-sdk');
const { assetIssuer, supportedAssets } = require('../lib/assets');

const isTestnet = process.env.STELLAR_NETWORK !== 'mainnet';

const server = new Horizon.Server(
  process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
);

const networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;

/**
 * Build the Stellar Asset object for a supported asset code on the active
 * network. Throws for unsupported codes.
 * @param {string} [code='USDC']
 */
function getAsset(code = 'USDC') {
  return new Asset(code, assetIssuer(code, isTestnet));
}

function getUSDC() {
  return getAsset('USDC');
}

module.exports = { server, networkPassphrase, isTestnet, getUSDC, getAsset, supportedAssets };
