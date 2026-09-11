/**
 * Recurring rent schedule unit tests.
 */

const { buildPaymentSchedule, summarizeSchedule } = require('../../src/services/schedule');

describe('buildPaymentSchedule', () => {
  test('generates the correct number of monthly periods', () => {
    const s = buildPaymentSchedule({
      startsAt: '2026-05-01',
      durationMonths: 12,
      rentAmount: '500',
      rentDueDay: 5,
    });
    expect(s).toHaveLength(12);
    expect(s[0].due_date).toBe('2026-05-05');
    expect(s[11].due_date).toBe('2027-04-05');
  });

  test('every period carries the full monthly rent', () => {
    const s = buildPaymentSchedule({
      startsAt: '2026-01-01',
      durationMonths: 3,
      rentAmount: '500.00',
      rentDueDay: 1,
    });
    for (const entry of s) expect(entry.amount).toBe('500.00');
  });

  test('defaults due day to the lease start day', () => {
    const s = buildPaymentSchedule({
      startsAt: '2026-06-15',
      durationMonths: 2,
      rentAmount: '750',
    });
    expect(s[0].due_date).toBe('2026-06-15');
    expect(s[1].due_date).toBe('2026-07-15');
  });

  test('clamps due day to the last day of shorter months', () => {
    const s = buildPaymentSchedule({
      startsAt: '2026-01-01',
      durationMonths: 3,
      rentAmount: '500',
      rentDueDay: 31,
    });
    expect(s[0].due_date).toBe('2026-01-31');
    expect(s[1].due_date).toBe('2026-02-28');
    expect(s[2].due_date).toBe('2026-03-31');
  });

  test('uses leap-year February when applicable', () => {
    const s = buildPaymentSchedule({
      startsAt: '2028-01-01',
      durationMonths: 2,
      rentAmount: '500',
      rentDueDay: 31,
    });
    expect(s[1].due_date).toBe('2028-02-29');
  });

  test('rejects missing or invalid inputs', () => {
    expect(() => buildPaymentSchedule({ startsAt: 'nope', durationMonths: 1 })).toThrow();
    expect(() => buildPaymentSchedule({ startsAt: '2026-01-01', durationMonths: 0 })).toThrow();
  });
});

describe('summarizeSchedule', () => {
  const schedule = buildPaymentSchedule({
    startsAt: '2026-05-01',
    durationMonths: 3,
    rentAmount: '500',
    rentDueDay: 5,
  });

  test('marks periods paid / overdue / scheduled', () => {
    const result = summarizeSchedule(schedule, {
      paidPeriods: ['2026-05-02T10:00:00.000Z'],
      now: '2026-06-06T00:00:00.000Z',
    });
    expect(result.schedule[0].status).toBe('paid'); // May 5 paid May 2
    expect(result.schedule[1].status).toBe('overdue'); // June 5 already passed
    expect(result.schedule[2].status).toBe('scheduled'); // July 5
  });

  test('flags an unpaid past-due period as overdue', () => {
    const result = summarizeSchedule(schedule, {
      paidPeriods: [],
      now: '2026-06-06T00:00:00.000Z',
    });
    expect(result.schedule[0].status).toBe('overdue'); // May 5 has passed
    expect(result.schedule[1].status).toBe('overdue'); // June 5 has passed
    expect(result.schedule[2].status).toBe('scheduled'); // July 5
  });

  test('computes exact monetary totals', () => {
    const result = summarizeSchedule(schedule, {
      paidPeriods: ['2026-05-01'],
      now: '2026-05-20T00:00:00.000Z',
    });
    expect(result.summary.total_due).toBe('1500.0000000');
    expect(result.summary.total_paid).toBe('500.0000000');
    expect(result.summary.outstanding).toBe('1000.0000000');
    expect(result.summary.paid_periods).toBe(1);
    expect(result.summary.total_periods).toBe(3);
  });

  test('reports the next scheduled due date or null', () => {
    const withNext = summarizeSchedule(schedule, {
      paidPeriods: [],
      now: '2026-05-01T00:00:00.000Z',
    });
    expect(withNext.next_due_date).toBe('2026-05-05');

    const noneLeft = summarizeSchedule(
      buildPaymentSchedule({ startsAt: '2026-01-01', durationMonths: 1, rentAmount: '500' }),
      { paidPeriods: ['2026-01-01'], now: '2026-01-20T00:00:00.000Z' },
    );
    expect(noneLeft.next_due_date).toBeNull();
  });
});
