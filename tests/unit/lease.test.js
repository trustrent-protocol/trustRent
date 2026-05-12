const { hashLeaseTerms, hashLeaseFile } = require('../../src/services/lease');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('lease service', () => {
  test('hashLeaseTerms produces consistent SHA-256 hex', () => {
    const terms = { rent: '500', tenant: 'Alice', landlord: 'Bob' };
    const hash = hashLeaseTerms(terms);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashLeaseTerms(terms)); // deterministic
  });

  test('hashLeaseTerms is order-independent', () => {
    const a = hashLeaseTerms({ rent: '500', tenant: 'Alice' });
    const b = hashLeaseTerms({ tenant: 'Alice', rent: '500' });
    expect(a).toBe(b);
  });

  test('hashLeaseFile hashes a file', () => {
    const tmp = path.join(os.tmpdir(), 'test-lease.txt');
    fs.writeFileSync(tmp, 'lease content');
    const hash = hashLeaseFile(tmp);
    expect(hash).toHaveLength(64);
    fs.unlinkSync(tmp);
  });
});
