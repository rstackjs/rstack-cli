// @ts-check
// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app({
  // Configure Rsbuild
});

define.test({
  setupFiles: ['./tests/rstest.setup.js'],
});

define.lint(({ js }) => [js.configs.recommended]);

define.fmt({
  singleQuote: true,
});
