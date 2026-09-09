/**
 * Lease lifecycle state machine unit tests.
 */

const {
  LEASE_STATUSES,
  LEASE_TRANSITIONS,
  nextStatuses,
  canTransition,
  assertTransition,
} = require('../../src/services/leaseState');

describe('lease state machine', () => {
  test('exposes the four known lease statuses', () => {
    expect(LEASE_STATUSES).toEqual(['pending', 'active', 'ended', 'cancelled']);
  });

  test('pending can only move to active or cancelled', () => {
    expect(nextStatuses('pending')).toEqual(['active', 'cancelled']);
    expect(canTransition('pending', 'active')).toBe(true);
    expect(canTransition('pending', 'cancelled')).toBe(true);
    expect(canTransition('pending', 'ended')).toBe(false);
  });

  test('active can only move to ended', () => {
    expect(canTransition('active', 'ended')).toBe(true);
    expect(canTransition('active', 'pending')).toBe(false);
    expect(canTransition('active', 'cancelled')).toBe(false);
  });

  test('ended and cancelled are terminal', () => {
    for (const status of ['ended', 'cancelled']) {
      expect(nextStatuses(status)).toEqual([]);
      for (const target of LEASE_STATUSES) {
        expect(canTransition(status, target)).toBe(false);
      }
    }
  });

  test('unknown statuses are rejected', () => {
    expect(nextStatuses('archived')).toBeNull();
    expect(canTransition('archived', 'active')).toBe(false);
    expect(() => assertTransition('archived', 'active')).toThrowError(/Unknown lease status/i);
  });

  test('self-transitions are conflicts', () => {
    expect(() => assertTransition('pending', 'pending')).toThrowError(/already pending/i);
  });

  test('assertTransition accepts legal transitions and rejects illegal ones', () => {
    expect(() => assertTransition('pending', 'active')).not.toThrow();
    expect(() => assertTransition('pending', 'ended')).toThrowError(/Cannot transition/);
    for (const status of ['ended', 'cancelled']) {
      expect(() => assertTransition(status, 'active')).toThrowError(/Cannot transition/);
    }
  });
});