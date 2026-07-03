import { define } from 'rstack';

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rslint --fix', 'oxfmt'],
  '*.{json,jsonc,md,mdx,css,html,yml,yaml}': 'oxfmt',
});
