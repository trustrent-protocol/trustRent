/**
 * Stellar memo helper tests — byte-accurate truncation for Memo.text (28 bytes)
 * and lease correlation tags.
 */

const {
  truncateToBytes,
  buildLeaseMemo,
  leaseMemoTag,
  MAX_MEMO_BYTES,
} = require('../../src/lib/memo');

describe('truncateToBytes', () => {
  test('keeps short ASCII memos untouched', () => {
    expect(truncateToBytes('trustrent:abc')).toBe('trustrent:abc');
  });

  test('truncates to 28 bytes, not 28 characters', () => {
    const long = 'x'.repeat(30);
    const out = truncateToBytes(long);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(MAX_MEMO_BYTES);
    expect(out).toBe('x'.repeat(28));
  });

  test('a boundary that falls inside a multi-byte sequence trims the whole char', () => {
    // 27 ASCII bytes + a 3-byte Euro sign = 30 bytes; the Euro must be dropped.
    const q = 'x'.repeat(27) + '\u20ac';
    expect(truncateToBytes(q)).toBe('x'.repeat(27));
  });

  test('keeps output valid UTF-8 for dense multi-byte input', () => {
    const emoji = '\ud83d\ude00'; // 😀 (4 bytes)
    const out = truncateToBytes(emoji.repeat(20)); // 80 bytes
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(MAX_MEMO_BYTES);
    const roundTrip = Buffer.from(out, 'utf8').toString('utf8');
    expect(roundTrip).toBe(out);
  });
});

describe('buildLeaseMemo / leaseMemoTag', () => {
  const LEASE_ID = '00000000-0000-0000-0000-000000000001';

  test('derives a deterministic tag from the lease UUID', () => {
    expect(leaseMemoTag(LEASE_ID)).toBe('000000000001');
    // Dropping the dashes changes the hex tail: different ids → different tags.
    expect(leaseMemoTag('11111111-2222-3333-4444-555555555555')).toBe('555555555555');
  });

  test('stamps the trustrent: prefix + tag', () => {
    expect(buildLeaseMemo(LEASE_ID)).toBe('trustrent:000000000001');
    expect(Buffer.byteLength(buildLeaseMemo(LEASE_ID), 'utf8')).toBe(22);
  });

  test('fits an optional suffix within the 28-byte limit', () => {
    const out = buildLeaseMemo(LEASE_ID, 'january 2026');
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(MAX_MEMO_BYTES);
    expect(out.startsWith('trustrent:000000000001 ')).toBe(true);
  });

  test('truncates a long suffix but keeps the prefix intact', () => {
    const out = buildLeaseMemo(LEASE_ID, 'y'.repeat(120));
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(MAX_MEMO_BYTES);
    expect(out.startsWith('trustrent:000000000001 ')).toBe(true);
  });
});