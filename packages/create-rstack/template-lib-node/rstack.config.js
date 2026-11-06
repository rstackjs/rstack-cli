// @ts-check
// Configuration guide: https://rstack.rs/guide/configuration
import { define } from 'rstack';

define.lib({});

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
