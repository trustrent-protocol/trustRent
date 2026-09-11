/**
 * Supported trustRent assets.
 *
 * A registry of issuers per network keeps asset handling explicit and
 * auditable. New assets (custom anchored assets, local stablecoins) are added
 * here as pinned { testnet, mainnet } issuers.
 *
 * Issuer addresses sourced from Circle's canonical contract-address docs.
 */

const ASSET_REGISTRY = {
  USDC: {
    testnet: { issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
    mainnet: { issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
  },
  EURC: {
    testnet: { issuer: 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO' },
    mainnet: { issuer: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2' },
  },
};

function supportedAssets() {
  return Object.keys(ASSET_REGISTRY);
}

/**
 * Resolve the pinned issuer for an asset code on a given network.
 * @param {string} code         asset code, e.g. 'USDC' or 'EURC'
 * @param {boolean} [isTestnet=true]
 * @returns {string} issuer public key
 * @throws {{ status: number, message: string }} on unknown asset codes
 */
function assetIssuer(code, isTestnet = true) {
  const asset = ASSET_REGISTRY[code];
  if (!asset) {
    const err = new Error(
      `Unsupported asset "${code}". Supported assets: ${supportedAssets().join(', ')}`,
    );
    err.status = 422;
    throw err;
  }
  return asset[isTestnet ? 'testnet' : 'mainnet'].issuer;
}

module.exports = { ASSET_REGISTRY, supportedAssets, assetIssuer };
