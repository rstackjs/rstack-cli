import { define } from 'rstack';

define.lint(async () => {
  const { js, ts } = await import('rstack/lint');
  return [
    js.configs.recommended,
    ts.configs.recommended,
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

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rs lint --fix', 'oxfmt --no-error-on-unmatched-pattern'],
  '*.{json,jsonc,md,mdx,css,html,yml,yaml}': 'oxfmt --no-error-on-unmatched-pattern',
});
