/**
 * Integer-only money math for Stellar-denominated amounts.
 *
 * All monetary values in trustRent are decimal strings with up to 7 fractional
 * places (Stellar's native precision). This module performs arithmetic on
 * 1e7-scaled BigInt units so amounts never round-trip through a float.
 */

const UNITS_PER_UNIT = 10000000n;

/**
 * Parse a decimal money string into 1e7-scaled integer units without touching
 * floating point at all (pure string manipulation). "499.99" → 4999900000.
 */
function parseToUnits(amount) {
  const [whole = '0', frac = ''] = String(amount).split('.');
  const padded = frac.padEnd(7, '0').slice(0, 7);
  return BigInt(whole) * UNITS_PER_UNIT + BigInt(padded);
}

/** Convert 1e7-scaled integer units back to a 7-decimal money string. */
function unitsToDecimal(units) {
  const s = units.toString().padStart(8, '0');
  return s.slice(0, -7) + '.' + s.slice(-7);
}

/** Sum any number of money strings and return the exact total. */
function add(...amounts) {
  let total = 0n;
  for (const amount of amounts) total += parseToUnits(amount);
  return unitsToDecimal(total);
}

/** Subtract b from a (money strings). Result may be negative. */
function sub(a, b) {
  return unitsToDecimal(parseToUnits(a) - parseToUnits(b));
}

/**
 * Scale an amount by numerator/denominator as exact integer math.
 * Truncates (rounds toward zero) on non-terminating divisions — consistent
 * with Stellar's payment behavior.
 * @returns {string} `amount * numerator / denominator` as a money string
 */
function scale(amount, numerator, denominator) {
  return unitsToDecimal((parseToUnits(amount) * BigInt(numerator)) / BigInt(denominator));
}

/** Strict equality on two money strings, normalizing trailing zeros. */
function eq(a, b) {
  return parseToUnits(a) === parseToUnits(b);
}

module.exports = { parseToUnits, unitsToDecimal, add, sub, scale, eq };
