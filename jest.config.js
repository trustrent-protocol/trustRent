/**
 * Jest configuration.
 *
 * - `npm test` runs unit tests with coverage thresholds enforced.
 * - `npm run test:testnet` runs integration tests against a live network
 *   without coverage so thresholds do not block it.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/db/migrate.js',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 75,
      branches: 65,
      functions: 60,
      lines: 75,
    },
  },
};