import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  testTimeout: 120000,
  moduleNameMapper: {
    '^@erp/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
  },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
};

export default config;
