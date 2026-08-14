// @ts-check
// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  syntax: ['node 22'],
});

define.test({
  // Configure Rstest
});

define.lint(({ js }) => [js.configs.recommended]);

define.fmt({
  singleQuote: true,
});
