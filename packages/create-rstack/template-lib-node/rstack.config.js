// @ts-check
// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  syntax: ['node 22'],
});

define.lint(({ js, rstestPlugin }) => [
  js.configs.recommended,
  {
    files: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    ...rstestPlugin.configs.recommended,
  },
]);

define.fmt({
  singleQuote: true,
});
