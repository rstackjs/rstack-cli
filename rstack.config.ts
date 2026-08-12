// Rstack configuration guide: https://rstack.rs/config
import globals from 'globals';
import { define } from 'rstack';

define.lint(async () => {
  const { js, ts } = await import('rstack/lint');
  return [
    js.configs.recommended,
    ts.configs.recommended,
    {
      files: [
        '**/*.config.{js,cjs,mjs}',
        '.agents/skills/**/scripts/**/*.{js,cjs,mjs}',
        'packages/rstack/bin/**/*.{js,cjs,mjs}',
        'scripts/**/*.{js,cjs,mjs}',
      ],
      languageOptions: {
        globals: globals.node,
      },
    },
    {
      files: [
        'packages/create-rstack/template-app-*/{src,tests}/**/*.{js,jsx}',
        'packages/create-rstack/template-lib-{react,solid,svelte,vue}/{src,tests}/**/*.{js,jsx}',
      ],
      languageOptions: {
        globals: globals.browser,
      },
    },
    {
      files: ['packages/rstack/tests/**/src/**/*.js'],
      languageOptions: {
        globals: {
          ...globals.browser,
          DEFINE_APP_TEST_VALUE: 'readonly',
          DEFINE_LIB_TEST_VALUE: 'readonly',
          DEFINE_VALUE: 'readonly',
        },
      },
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
  ignorePatterns: ['packages/rstack/binding.cjs', 'packages/rstack/binding.d.cts'],
  overrides: [
    {
      files: 'packages/create-rstack/template-*/**/*',
      options: {
        printWidth: 80,
      },
    },
  ],
  printWidth: 100,
  singleQuote: true,
  sortPackageJson: true,
});

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rs lint --fix', 'rs fmt'],
  '*.{json,jsonc,md,mdx,css,html,yml,yaml}': 'rs fmt',
});
