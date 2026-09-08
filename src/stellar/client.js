const { Horizon, Networks, Asset } = require('@stellar/stellar-sdk');

const isTestnet = process.env.STELLAR_NETWORK !== 'mainnet';

const server = new Horizon.Server(
  process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
);

const networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;

const USDC_ISSUER_TESTNET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC_ISSUER_MAINNET = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

function getUSDC() {
  const issuer = isTestnet ? USDC_ISSUER_TESTNET : USDC_ISSUER_MAINNET;
  return new Asset('USDC', issuer);
}

module.exports = { server, networkPassphrase, isTestnet, getUSDC };
