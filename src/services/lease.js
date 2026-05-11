const crypto = require('crypto');
const fs = require('fs');

/**
 * Hash a lease document file (SHA-256).
 * @param {string} filePath  path to the lease PDF/document
 * @returns {string} hex digest
 */
function hashLeaseFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Hash lease terms object (for programmatic leases without a PDF).
 * @param {object} terms
 * @returns {string} hex digest
 */
function hashLeaseTerms(terms) {
  const canonical = JSON.stringify(terms, Object.keys(terms).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

module.exports = { hashLeaseFile, hashLeaseTerms };
