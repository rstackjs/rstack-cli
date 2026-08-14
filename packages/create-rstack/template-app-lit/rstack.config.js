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

define.lint(({ js }) => [js.configs.recommended]);

define.fmt({
  singleQuote: true,
});
