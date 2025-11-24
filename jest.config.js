module.exports = {
    testEnvironment: 'node',
    coveragePathIgnorePatterns: ['/node_modules/'],
    collectCoverageFrom: [
      'app/**/*.js',
      '!app/config/**'
    ],
    coverageThreshold: {
      global: {
        branches: 50,
        functions: 65,
        lines: 70,
        statements: 70
      }
    }
  };