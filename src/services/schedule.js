const { add, sub } = require('../lib/money');

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/** YYYY-MM key used to match a confirmed payment to its rent period. */
function periodKey(dueDate) {
  return String(dueDate).slice(0, 7);
}

/**
 * Build the full rent schedule for a lease.
 *
 * Rent is due once per calendar month, `durationMonths` times. The due day
 * defaults to the lease start day and is clamped to the last day of shorter
 * months (e.g. due day 31 in February → Feb 28/29).
 *
 * @param {object} opts
 * @param {string} opts.startsAt        lease start date (YYYY-MM-DD)
 * @param {number} opts.durationMonths  number of rent periods
 * @param {string} opts.rentAmount      monthly rent (money string)
 * @param {number} [opts.rentDueDay]    day of month rent is due (1-31)
 * @returns {Array<{period: number, period_label: string, due_date: string, amount: string}>}
 */
function buildPaymentSchedule({ startsAt, durationMonths, rentAmount, rentDueDay }) {
  const start = new Date(`${String(startsAt).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new TypeError(`Invalid startsAt: ${startsAt}`);

  const total = Number(durationMonths);
  if (!Number.isInteger(total) || total < 1) {
    throw new TypeError(`durationMonths must be a positive integer, got: ${durationMonths}`);
  }

  const dueDay = Number(rentDueDay) || start.getUTCDate();
  const entries = [];

  for (let i = 1; i <= total; i++) {
    const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (i - 1), 1));
    const lastDay = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const dueDate = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(dueDay, lastDay)),
    );

    entries.push({
      period: i,
      period_label: `${MONTH_NAMES[dueDate.getUTCMonth()]} ${dueDate.getUTCFullYear()}`,
      due_date: isoDay(dueDate),
      amount: String(rentAmount),
    });
  }

  return entries;
}

/**
 * Annotate a payment schedule with per-period status and monetary summary.
 *
 * A period is `paid` when a confirmed payment settled within its calendar
 * month, `overdue` when its due date has passed unpaid, otherwise `scheduled`.
 *
 * @param {Array<object>} schedule                     output of buildPaymentSchedule
 * @param {object} [opts]
 * @param {string[]} [opts.paidPeriods]                settlement dates (YYYY-MM-DD) of confirmed payments
 * @param {string|Date} [opts.now=new Date()]          reference date for overdue computation
 * @returns {{ schedule: Array<object>, summary: object, next_due_date: string|null }}
 */
function summarizeSchedule(schedule, { paidPeriods = [], now = new Date() } = {}) {
  const paidKeys = new Set(paidPeriods.map((p) => periodKey(p)));
  const today = isoDay(new Date(now));

  let totalDue = '0.0000000';
  let totalPaid = '0.0000000';

  const items = schedule.map((entry) => {
    let status = 'scheduled';
    if (paidKeys.has(periodKey(entry.due_date))) status = 'paid';
    else if (entry.due_date < today) status = 'overdue';

    totalDue = add(totalDue, entry.amount);
    if (status === 'paid') totalPaid = add(totalPaid, entry.amount);

    return { ...entry, status };
  });

  return {
    schedule: items,
    summary: {
      total_periods: items.length,
      paid_periods: items.filter((i) => i.status === 'paid').length,
      overdue_periods: items.filter((i) => i.status === 'overdue').length,
      due_periods: items.filter((i) => i.status === 'scheduled').length,
      total_due: totalDue,
      total_paid: totalPaid,
      outstanding: sub(totalDue, totalPaid),
    },
    next_due_date: items.find((i) => i.status === 'scheduled')?.due_date ?? null,
  };
}

module.exports = { buildPaymentSchedule, summarizeSchedule, periodKey };
