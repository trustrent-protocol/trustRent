/**
 * Calendar helpers for lease due-date math.
 * Dates are handled in UTC to keep schedule generation deterministic across
 * timezones.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid date: ${value}`);
  return date;
}

/**
 * Whole days a payment is late (0 when paid on or before the due date).
 * @param {string|Date} dueDate  rent due date
 * @param {string|Date} [paidAt=new Date()]
 */
function daysLate(dueDate, paidAt = new Date()) {
  const due = toUtcDate(dueDate);
  const paid = toUtcDate(paidAt);
  return Math.max(0, Math.floor((paid - due) / DAY_MS));
}

/**
 * Build a UTC date for the `rentDueDay` of the month containing `refDate`.
 * @param {number} rentDueDay  day of month (1-31)
 * @param {string|Date} [refDate=new Date()]
 */
function dueDateForMonth(rentDueDay, refDate = new Date()) {
  const ref = toUtcDate(refDate);
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), rentDueDay));
}

module.exports = { daysLate, dueDateForMonth };
