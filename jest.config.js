module.exports = {
    testEnvironment: 'node',
    coveragePathIgnorePatterns: ['/node_modules/'],
    collectCoverageFrom: [
      'app/**/*.js',
      '!app/config/**'
    ],
    coverageThreshold: {
      global: {
        branches: 55,
        functions: 69,
        lines: 70,
        statements: 70
      }
    }
  };