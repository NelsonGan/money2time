/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^~/lib/i18n$': '<rootDir>/__tests__/__mocks__/i18n.ts',
    '^~/services/haptics$': '<rootDir>/__tests__/__mocks__/haptics.ts',
    '^~/lib/db/client$': '<rootDir>/__tests__/__mocks__/dbClient.ts',
    '^expo-localization$': '<rootDir>/__tests__/__mocks__/expo-localization.ts',
    '^drizzle-orm$': '<rootDir>/__tests__/__mocks__/drizzle.ts',
    '^drizzle-orm/sqlite-core$': '<rootDir>/__tests__/__mocks__/drizzle.ts',
    '\\.(png|jpg|jpeg|gif|webp|svg)$': '<rootDir>/__tests__/__mocks__/imageAsset.ts',
    '^~/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react',
          esModuleInterop: true,
          allowJs: true,
          isolatedModules: true,
        },
        diagnostics: false,
      },
    ],
  },
};
