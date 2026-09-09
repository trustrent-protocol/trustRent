/**
 * Payment splitting logic unit tests.
 * Exercises the real calculateSplits exported from src/stellar/payments.js
 * (pure integer-unit math, no floating point, no network access required).
 */

const { calculateSplits } = require('../../src/stellar/payments');

describe('payment splitting', () => {
  test('7% agent fee on 500 USDC', () => {
    const { landlord, agent } = calculateSplits('500', 7);
    expect(landlord).toBe('465.0000000');
    expect(agent).toBe('35.0000000');
  });

  test('0% agent fee sends full amount to landlord', () => {
    const { landlord, agent } = calculateSplits('500', 0);
    expect(landlord).toBe('500.0000000');
    expect(agent).toBe('0.0000000');
  });

  test('100% agent fee sends full amount to agent', () => {
    const { landlord, agent } = calculateSplits('500', 100);
    expect(landlord).toBe('0.0000000');
    expect(agent).toBe('500.0000000');
  });

  test('splits always sum exactly to total (no float drift)', () => {
    const toUnits = (s) => {
      const [w, f = ''] = String(s).split('.');
      return BigInt(w) * 10000000n + BigInt(f.padEnd(7, '0').slice(0, 7));
    };
    for (const [amount, pct] of [
      ['750', 10],
      ['499.99', 33],
      ['0.01', 5],
      ['12345.6789', 7.5],
      ['0.0000001', 99],
      ['1', 33.33],
    ]) {
      const { landlord, agent } = calculateSplits(amount, pct);
      const expectedUnits = toUnits(amount);
      expect((toUnits(landlord) + toUnits(agent)).toString()).toBe(expectedUnits.toString());
      expect(landlord).toMatch(/^\d+\.\d{7}$/);
      expect(agent).toMatch(/^\d+\.\d{7}$/);
    }
  });

  test('fractional cent amounts split exactly', () => {
    // 33% of $499.99 = $164.9967 to agent, $334.9933 to landlord
    const { landlord, agent } = calculateSplits('499.99', 33);
    expect(landlord).toBe('334.9933000');
    expect(agent).toBe('164.9967000');
  });

  test('outputs are 7-decimal strings, never floats', () => {
    const { landlord, agent } = calculateSplits('500.25', 7);
    expect(typeof landlord).toBe('string');
    expect(typeof agent).toBe('string');
  });
});
