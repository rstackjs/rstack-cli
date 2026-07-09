import { define } from 'rstack';

define.lint(async () => {
  const { js, ts } = await import('rstack/lint');
  return [
    js.configs.recommended,
    ts.configs.recommended,
    {
      languageOptions: {
        parserOptions: {
          project: [
            './packages/*/tsconfig.json',
            './packages/*/test/tsconfig.json',
            './examples/*/tsconfig.json',
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
