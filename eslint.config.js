// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const simpleImportSort = require('eslint-plugin-simple-import-sort');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'cloudflare/**', '.agents/**', '.claude/**'],
  },
  {
    // The @typescript-eslint plugin is only registered for TypeScript files, so
    // these rules have to be scoped to them: applied to a .js file they made
    // ESLint crash, which `expo lint` swallowed, so nothing was ever linted.
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', disallowTypeAnnotations: false },
      ],
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '~/lib/formatters',
                '~/lib/errorHandling',
                '~/lib/id',
                '~/lib/motion',
                '~/lib/types',
                '~/lib/utils',
                '~/lib/haptics',
                '~/lib/hourlyValueNavigation',
                '~/lib/usePressScale',
                '~/lib/hooks/*',
                '~/lib/services/*',
                '~/lib/designSystem',
              ],
              message:
                'This module moved to top-level domains: use ~/utils, ~/types, ~/services, ~/hooks, or ~/constants.',
            },
          ],
        },
      ],
    },
  },
  {
    // Node scripts run outside the app bundle.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { Buffer: 'readonly' } },
  },
  {
    // Jest hoists jest.mock above imports, so tests import (or require) the
    // module under test after declaring its mocks.
    files: ['__tests__/**/*.{ts,tsx}'],
    rules: {
      'import/first': 'off',
      'import/no-named-as-default': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
