const { scale } = require('../lib/money');
const { daysLate, dueDateForMonth } = require('../lib/calendar');

/**
 * Compute a late fee as exact integer math.
 *
 * Fee = rent * (dailyRatePct / 100) * chargeableDays, where chargeableDays is
 * the number of days past the grace period. `dailyRatePct` is expressed as a
 * percentage of the monthly rent, e.g. 0.05 means 0.05%/day.
 *
 * @param {object} opts
 * @param {string} opts.rentAmount          monthly rent (money string)
 * @param {number} opts.daysLate            whole late days
 * @param {number} [opts.gracePeriodDays=0] fee-free days
 * @param {number} [opts.dailyRatePct=0.05] % of rent charged per late day
 * @returns {string} late fee as a money string ("0.0000000" when not late)
 */
function calculateLateFee({ rentAmount, daysLate, gracePeriodDays = 0, dailyRatePct = 0.05 }) {
  const chargeable = Math.max(0, Number(daysLate) - Number(gracePeriodDays));
  if (chargeable === 0) return '0.0000000';
  const bps = Math.round(Number(dailyRatePct) * 100); // percent → basis points
  return scale(rentAmount, bps * chargeable, 10000);
}

/**
 * Lease-aware wrapper: computes the due date for the current rent period from
 * `lease.rent_due_day` and returns fee + late-day detail for a reference date.
 *
 * @param {object} lease  lease row with `rent_amount`, `rent_due_day`,
 *                        `late_fee_daily_pct`, `late_fee_grace_days`
 * @param {string|Date} [refDate=new Date()]
 * @returns {{ lateFee: string, daysLate: number, dueDate: Date }}
 */
function computeLateFee(lease, refDate = new Date()) {
  if (!lease.rent_due_day) {
    return { lateFee: '0.0000000', daysLate: 0, dueDate: null };
  }
  const dueDate = dueDateForMonth(lease.rent_due_day, refDate);
  const late = daysLate(dueDate, refDate);
  const lateFee = calculateLateFee({
    rentAmount: lease.rent_amount,
    daysLate: late,
    gracePeriodDays: lease.late_fee_grace_days,
    dailyRatePct: lease.late_fee_daily_pct,
  });
  return { lateFee, daysLate: late, dueDate };
}

module.exports = { calculateLateFee, computeLateFee };
