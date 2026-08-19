// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lint(async ({ js, ts, rstestPlugin }) => {
  const { default: globals } = await import('globals');
  return [
    js.configs.recommended,
    ts.configs.recommendedTypeChecked,
    {
      files: ['**/*.{js,jsx,cjs,mjs}'],
      languageOptions: {
        globals: {
          ...globals.browser,
          ...globals.nodeBuiltin,
          DEFINE_APP_TEST_VALUE: 'readonly',
          DEFINE_LIB_TEST_VALUE: 'readonly',
          DEFINE_VALUE: 'readonly',
        },
      },
    },
    {
      files: ['**/*.test.{ts,tsx}'],
      ...rstestPlugin.configs.recommended,
    },
    // Source imports use .ts for Node.js native TypeScript execution; builds rewrite them to .js.
    {
      files: ['packages/rstack/src/**/*.ts'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                regex: String.raw`^\.{1,2}/.*\.js$`,
                message: 'Use the .ts extension for relative imports.',
              },
            ],
          },
        ],
      },
    },
    {
      languageOptions: {
        parserOptions: {
          project: [
            './packages/*/tsconfig.json',
            './packages/*/tests/tsconfig.json',
            './packages/rstack/tests/types/*/tsconfig.json',
            './examples/*/tsconfig.json',
            './website/tsconfig.json',
          ],
        },
      },
    },
  ];
});

define.fmt({
  ignorePatterns: [
    'packages/rstack/binding.cjs',
    'packages/rstack/binding.d.cts',
  ],
  singleQuote: true,
  sortPackageJson: true,
});

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rs lint --fix', 'rs fmt'],
  '*.{json,jsonc,md,mdx,css,html,yml,yaml}': 'rs fmt',
});
