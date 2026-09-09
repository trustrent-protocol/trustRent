/**
 * Lease lifecycle state machine.
 *
 * A lease moves through a small, explicit set of states. Transitions are
 * enforced server-side so a landlord cannot arbitrarily flip a lease from
 * `pending` straight to `ended`, or resurrect a cancelled lease.
 */
const LEASE_STATUSES = ['pending', 'active', 'ended', 'cancelled'];

const LEASE_TRANSITIONS = {
  pending: ['active', 'cancelled'],
  active: ['ended'],
  ended: [],
  cancelled: [],
};

/**
 * Return the allowed next statuses for a given status, or `null` when the
 * status is not a known lease status.
 * @param {string} status
 */
function nextStatuses(status) {
  if (typeof status !== 'string' || !LEASE_TRANSITIONS[status]) return null;
  return LEASE_TRANSITIONS[status];
}

/**
 * @param {string} from current status
 * @param {string} to   requested next status
 * @returns {boolean} whether the transition is legal
 */
function canTransition(from, to) {
  const allowed = nextStatuses(from);
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * Throw an HTTP-style error (with a 409 status that maps to the API's
 * conflict response) unless the transition is legal.
 * @param {string} from
 * @param {string} to
 * @throws {{ status: number, message: string }}
 */
function assertTransition(from, to) {
  if (!nextStatuses(from)) {
    const err = new Error(`Unknown lease status "${from}"`);
    err.status = 500;
    throw err;
  }
  if (from === to) {
    const err = new Error(`Lease is already ${from}`);
    err.status = 409;
    throw err;
  }
  if (!canTransition(from, to)) {
    const err = new Error(
      `Cannot transition lease from "${from}" to "${to}" (allowed: ${nextStatuses(from).join(', ')})`,
    );
    err.status = 409;
    throw err;
  }
}

module.exports = {
  LEASE_STATUSES,
  LEASE_TRANSITIONS,
  nextStatuses,
  canTransition,
  assertTransition,
};
