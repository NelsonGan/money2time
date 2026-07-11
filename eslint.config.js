// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const simpleImportSort = require('eslint-plugin-simple-import-sort');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'workers/**'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
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
]);
