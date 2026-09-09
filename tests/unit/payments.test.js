/**
 * Payment splitting logic unit tests.
 * Exercises the real calculateSplits exported from src/stellar/payments.js
 * (integer-unit math, no network access required).
 */

const { calculateSplits } = require('../../src/stellar/payments');

describe('payment splitting', () => {
  test('7% agent fee on 500 USDC', () => {
    const { landlord, agent } = calculateSplits('500', 7);
    expect(parseFloat(landlord)).toBeCloseTo(465, 5);
    expect(parseFloat(agent)).toBeCloseTo(35, 5);
  });

  test('0% agent fee sends full amount to landlord', () => {
    const { landlord, agent } = calculateSplits('500', 0);
    expect(parseFloat(landlord)).toBe(500);
    expect(parseFloat(agent)).toBe(0);
  });

  test('100% agent fee sends full amount to agent', () => {
    const { landlord, agent } = calculateSplits('500', 100);
    expect(parseFloat(landlord)).toBe(0);
    expect(parseFloat(agent)).toBe(500);
  });

  test('splits always sum exactly to total (no float drift)', () => {
    for (const [amount, pct] of [
      ['750', 10],
      ['499.99', 33],
      ['0.01', 5],
      ['12345.6789', 7.5],
    ]) {
      const { landlord, agent } = calculateSplits(amount, pct);
      const sum = parseFloat(landlord) + parseFloat(agent);
      expect(sum).toBeCloseTo(parseFloat(amount), 7);
      expect(landlord).toMatch(/^\d+\.\d{7}$/);
      expect(agent).toMatch(/^\d+\.\d{7}$/);
    }
  });

  test('outputs are 7-decimal strings, never floats', () => {
    const { landlord, agent } = calculateSplits('500.25', 7);
    expect(typeof landlord).toBe('string');
    expect(typeof agent).toBe('string');
  });
});
