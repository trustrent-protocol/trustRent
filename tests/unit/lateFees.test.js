/**
 * Late-fee calculation unit tests.
 * All math is exact integer arithmetic — no floating point.
 */

const { calculateLateFee, computeLateFee } = require('../../src/services/lateFees');
const { daysLate } = require('../../src/lib/calendar');

describe('calculateLateFee', () => {
  test('0.05%/day on 500 rent, 10 days late = 2.50', () => {
    expect(calculateLateFee({ rentAmount: '500', daysLate: 10, dailyRatePct: 0.05 })).toBe(
      '2.5000000',
    );
  });

  test('no fee when paid on time', () => {
    expect(calculateLateFee({ rentAmount: '500', daysLate: 0, dailyRatePct: 0.05 })).toBe(
      '0.0000000',
    );
  });

  test('grace period exempts the first N days', () => {
    expect(
      calculateLateFee({ rentAmount: '1000', daysLate: 8, gracePeriodDays: 5, dailyRatePct: 0.05 }),
    ).toBe('1.5000000');
  });

  test('fractional rents stay exact', () => {
    // 499.99 × 0.0005 × 7 = 1.749965
    expect(calculateLateFee({ rentAmount: '499.99', daysLate: 7, dailyRatePct: 0.05 })).toBe(
      '1.7499650',
    );
  });

  test('whole-period grace yields zero regardless of lateness', () => {
    expect(calculateLateFee({ rentAmount: '500', daysLate: 30, gracePeriodDays: 30 })).toBe(
      '0.0000000',
    );
  });
});

describe('daysLate', () => {
  test('counts full elapsed days', () => {
    expect(daysLate('2026-02-01', '2026-02-10')).toBe(9);
  });

  test('paid on the due date is not late', () => {
    expect(daysLate('2026-02-01', '2026-02-01')).toBe(0);
  });

  test('paid before the due date is not late', () => {
    expect(daysLate('2026-02-01', '2026-01-30')).toBe(0);
  });
});

describe('computeLateFee (lease-aware)', () => {
  const lease = {
    rent_amount: '500',
    rent_due_day: 5,
    late_fee_daily_pct: 0.05,
    late_fee_grace_days: 0,
  };

  test('late after the due day of the reference month', () => {
    const { lateFee, daysLate: dl } = computeLateFee(lease, new Date('2026-05-20T00:00:00Z'));
    expect(dl).toBe(15);
    expect(lateFee).toBe('3.7500000'); // 500 × 0.0005 × 15
  });

  test('not late before the due day', () => {
    const { lateFee, daysLate: dl } = computeLateFee(lease, new Date('2026-05-01T00:00:00Z'));
    expect(dl).toBe(0);
    expect(lateFee).toBe('0.0000000');
  });

  test('lease without a rent_due_day never accrues a fee', () => {
    const { lateFee, daysLate: dl } = computeLateFee(
      { rent_amount: '500', rent_due_day: null },
      new Date('2026-05-20T00:00:00Z'),
    );
    expect(dl).toBe(0);
    expect(lateFee).toBe('0.0000000');
  });

  test('honors the lease grace period', () => {
    const { lateFee } = computeLateFee(
      { ...lease, late_fee_grace_days: 10 },
      new Date('2026-05-20T00:00:00Z'),
    );
    expect(lateFee).toBe('1.2500000'); // 500 × 0.0005 × 5
  });
});
