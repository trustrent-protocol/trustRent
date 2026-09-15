/**
 * Integer-only money math unit tests. These lock the invariants that make the
 * rest of the payment/split/late-fee code trustworthy: no floats, exact
 * 7-decimal scaling, truncation toward zero.
 */

const { parseToUnits, unitsToDecimal, add, sub, scale, eq } = require('../../src/lib/money');

describe('parseToUnits / unitsToDecimal', () => {
  const cases = [
    ['0', '0.0000000'],
    ['500', '500.0000000'],
    ['499.99', '499.9900000'],
    ['0.0000001', '0.0000001'],
    ['123.1234567', '123.1234567'],
  ];

  test.each(cases)('parseToUnits(%s) round-trips', (amount, expected) => {
    expect(unitsToDecimal(parseToUnits(amount))).toBe(expected);
  });

  test('normalizes missing fraction digits to 7 places', () => {
    expect(parseToUnits('1.5')).toBe(15000000n);
    expect(parseToUnits('0.01')).toBe(100000n);
  });

  test('truncates to 7 decimal places (never rounds up)', () => {
    expect(parseToUnits('1.123456789')).toBe(parseToUnits('1.1234567'));
  });

  test('unitsToDecimal pads short outputs with leading zeros', () => {
    expect(unitsToDecimal(1n)).toBe('0.0000001');
  });
});

describe('add / sub / scale / eq', () => {
  test('add sums exactly without float drift', () => {
    expect(add('0.1', '0.2')).toBe('0.3000000');
    expect(add('100', '0.99', '0.01')).toBe('101.0000000');
  });

  test('sub can go negative and renders a signed string', () => {
    expect(sub('5', '10')).toBe('-5.0000000');
    expect(sub('10', '5.5')).toBe('4.5000000');
  });

  test('scale truncates toward zero on non-terminating division', () => {
    expect(scale('100.00', 1, 3)).toBe('33.3333333');
    expect(scale('0.01', 1, 3)).toBe('0.0033333');
  });

  test('eq compares normalized values, ignoring trailing zeros', () => {
    expect(eq('1.0', '1.0000000')).toBe(true);
    expect(eq('0.5', '0.5000000')).toBe(true);
    expect(eq('0.5', '0.5000001')).toBe(false);
  });
});
