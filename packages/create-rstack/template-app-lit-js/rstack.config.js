// @ts-check
// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app({
  html: {
    template: './src/index.html',
  },
  source: {
    decorators: {
      version: 'legacy',
    },
  },
});

define.test({
  testEnvironment: 'happy-dom',
});

define.lint(async () => {
  const { js } = await import('rstack/lint');

  return [js.configs.recommended];
});

define.fmt({
  singleQuote: true,
});

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rs lint --fix', 'rs fmt'],
  '*.{json,jsonc,md,mdx,css,html,yml,yaml}': 'rs fmt',
});
