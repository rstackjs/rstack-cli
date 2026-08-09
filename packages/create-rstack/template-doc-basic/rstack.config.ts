// Rstack configuration guide: https://rstack.rs/config
import path from 'node:path';
import { define } from 'rstack';

define.doc({
  root: path.join(import.meta.dirname, 'docs'),
  title: 'My Site',
});

define.lint(async () => {
  const { js, ts, reactPlugin, reactHooksPlugin } = await import('rstack/lint');

  return [
    js.configs.recommended,
    ts.configs.recommended,
    reactPlugin.configs.recommended,
    reactHooksPlugin.configs.recommended,
  ];
});

define.fmt({
  singleQuote: true,
});

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rs lint --fix', 'rs fmt'],
  '*.{json,jsonc,md,mdx,css,html,yml,yaml}': 'rs fmt',
});
