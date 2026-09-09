/**
 * Validator unit tests — run the express-validator chains exported by
 * src/api/validators/money.js against sample request bodies.
 */

const { money, percentage } = require('../../src/api/validators/money');

function buildRequest(body) {
  return { body };
}

async function validateChain(chain, req) {
  const result = await chain.run(req);
  return result.array();
}

describe('money validator', () => {
  test('accepts positive decimal strings', async () => {
    for (const v of ['500', '500.00', '0.01', '123.1234567']) {
      const errors = await validateChain(money('amount'), buildRequest({ amount: v }));
      expect(errors).toEqual([]);
    }
  });

  test('rejects negative amounts', async () => {
    const errors = await validateChain(money('amount'), buildRequest({ amount: '-5' }));
    expect(errors).not.toEqual([]);
  });

  test('rejects zero when positive is required', async () => {
    const errors = await validateChain(money('amount'), buildRequest({ amount: '0' }));
    expect(errors).not.toEqual([]);
  });

  test('accepts zero when positive is disabled', async () => {
    const errors = await validateChain(
      money('amount', { positive: false }),
      buildRequest({ amount: '0' }),
    );
    expect(errors).toEqual([]);
  });

  test('rejects non-strings and invalid decimals', async () => {
    for (const v of [500, 'abc', '1e3', '1.12345678', NaN]) {
      const errors = await validateChain(money('amount'), buildRequest({ amount: v }));
      expect(errors).not.toEqual([]);
    }
  });
});

describe('percentage validator', () => {
  test('accepts 0..100', async () => {
    for (const v of ['0', '7', '100', 7.5]) {
      const errors = await validateChain(
        percentage('agent_fee_pct'),
        buildRequest({ agent_fee_pct: v }),
      );
      expect(errors).toEqual([]);
    }
  });

  test('rejects out-of-range values', async () => {
    for (const v of ['-1', '100.01', '101']) {
      const errors = await validateChain(
        percentage('agent_fee_pct'),
        buildRequest({ agent_fee_pct: v }),
      );
      expect(errors).not.toEqual([]);
    }
  });

  test('is optional by default', async () => {
    const errors = await validateChain(percentage('agent_fee_pct'), buildRequest({}));
    expect(errors).toEqual([]);
  });
});
