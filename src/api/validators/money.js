/**
 * Shared express-validator builders for trustRent input rules.
 *
 * Monetary values are handled as strings (decimal, up to 7 places — the
 * resolution of the underlying asset) to avoid floating-point drift, in line
 * with the project standard documented in README.
 */

const MONEY_RE = /^\d+(\.\d{1,7})?$/;

function isPositiveAmountString(value) {
  return MONEY_RE.test(String(value)) && Number(value) > 0;
}

function isAmountString(value) {
  return MONEY_RE.test(String(value));
}

/**
 * @param {string} field            request-body field name
 * @param {boolean} [positive=true] require the amount to be > 0
 */
function money(field, { positive = true } = {}) {
  return require('express-validator').body(field)
    .isString()
    .custom(positive ? isPositiveAmountString : isAmountString)
    .withMessage(`${field} must be a non-negative decimal string like "500.00"`);
}

/** Percentage rule bounded to [0, 100]. */
function percentage(field, { optional = true } = {}) {
  const chain = optional
    ? require('express-validator').body(field).optional({ values: 'null' })
    : require('express-validator').body(field);
  return chain
    .isFloat({ min: 0, max: 100 })
    .withMessage(`${field} must be between 0 and 100`);
}

module.exports = { money, percentage };