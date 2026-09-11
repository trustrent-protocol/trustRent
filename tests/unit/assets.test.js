/**
 * Asset registry unit tests.
 * The registry maps asset codes to pinned issuers per network.
 */

const { supportedAssets, assetIssuer, ASSET_REGISTRY } = require('../../src/lib/assets');

describe('supportedAssets', () => {
  test('exposes USDC and EURC', () => {
    expect(supportedAssets()).toContain('USDC');
    expect(supportedAssets()).toContain('EURC');
  });

  test('every asset has pinned testnet and mainnet issuers', () => {
    for (const asset of Object.entries(ASSET_REGISTRY)) {
      expect(asset[1].testnet.issuer).toMatch(/^G[A-Z0-9]{55}$/);
      expect(asset[1].mainnet.issuer).toMatch(/^G[A-Z0-9]{55}$/);
    }
  });
});

describe('assetIssuer', () => {
  test('resolves USDC issuers per network', () => {
    expect(assetIssuer('USDC', true)).toBe(ASSET_REGISTRY.USDC.testnet.issuer);
    expect(assetIssuer('USDC', false)).toBe(ASSET_REGISTRY.USDC.mainnet.issuer);
  });

  test('resolves EURC issuers per network', () => {
    expect(assetIssuer('EURC', true)).toBe(ASSET_REGISTRY.EURC.testnet.issuer);
    expect(assetIssuer('EURC', false)).toBe(ASSET_REGISTRY.EURC.mainnet.issuer);
  });

  test('testnet and mainnet issuers differ (are not lookalikes)', () => {
    expect(ASSET_REGISTRY.USDC.testnet.issuer).not.toBe(ASSET_REGISTRY.USDC.mainnet.issuer);
    expect(ASSET_REGISTRY.EURC.testnet.issuer).not.toBe(ASSET_REGISTRY.EURC.mainnet.issuer);
  });

  test('rejects unsupported asset codes with 422', () => {
    try {
      assetIssuer('BTC');
      expect.unreachable();
    } catch (err) {
      expect(err.status).toBe(422);
      expect(err.message).toMatch(/Unsupported asset "BTC"/);
    }
  });
});
