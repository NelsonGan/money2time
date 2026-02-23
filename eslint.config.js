// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', disallowTypeAnnotations: false },
      ],
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
