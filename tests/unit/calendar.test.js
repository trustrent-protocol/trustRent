/**
 * Calendar helper unit tests (UTC due-date math).
 */

const { daysLate, dueDateForMonth } = require('../../src/lib/calendar');

describe('daysLate', () => {
  test('is zero when paying on the due date', () => {
    expect(daysLate('2026-01-05', '2026-01-05')).toBe(0);
  });

  test('is zero when paying early', () => {
    expect(daysLate('2026-01-05', '2026-01-01')).toBe(0);
  });

  test('counts whole days after the due date', () => {
    expect(daysLate('2026-01-05', '2026-01-10')).toBe(5);
    expect(daysLate('2026-01-05', '2026-01-15')).toBe(10);
  });

  test('ignores time-of-day components', () => {
    expect(daysLate('2026-01-05', '2026-01-06T23:59:59Z')).toBe(1);
  });

  test('throws on invalid input', () => {
    expect(() => daysLate('not-a-date')).toThrow(TypeError);
  });
});

describe('dueDateForMonth', () => {
  test('uses the given day of the month', () => {
    const date = dueDateForMonth(15, new Date('2026-02-10T00:00:00Z'));
    expect(date.toISOString()).toBe('2026-02-15T00:00:00.000Z');
  });

  test('defaults the reference date to now', () => {
    const date = dueDateForMonth(1);
    expect(date.getUTCDate()).toBe(1);
    expect(isNaN(date.getTime())).toBe(false);
  });

  test('is deterministic in UTC across month boundaries', () => {
    // Due day 31 is not clamped here: clamping is the schedule's job.
    const date = dueDateForMonth(31, new Date('2026-02-10T00:00:00Z'));
    expect(date.getUTCMonth()).toBe(2); // rolled into March
    expect(date.getUTCDate()).toBe(3);
  });
});