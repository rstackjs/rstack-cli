// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  syntax: ['node 22'],
  dts: true,
});

define.test({
  // Configure Rstest
});

define.lint(async () => {
  const { js, ts } = await import('rstack/lint');

  return [js.configs.recommended, ts.configs.recommended];
});

define.fmt({
  singleQuote: true,
});

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rs lint --fix', 'rs fmt'],
  '*.{json,jsonc,md,mdx,css,html,yml,yaml}': 'rs fmt',
});
