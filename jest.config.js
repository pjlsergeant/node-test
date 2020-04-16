module.exports = {
  ...require('./node_modules/@connectedcars/setup/jest.config.js'),
  roots: ['<rootDir>/src', '<rootDir>/bin'],
  globalSetup: './src/test-setup.ts',
  globalTeardown: './src/test-teardown.ts'
}
