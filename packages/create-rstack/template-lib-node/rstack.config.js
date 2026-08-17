// @ts-check
// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  syntax: ['node 22'],
});

define.lint(({ js }) => [js.configs.recommended]);

define.fmt({
  singleQuote: true,
});
