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
  const { js, ts } = await import('rstack/lint');

  return [js.configs.recommended, ts.configs.recommendedTypeChecked];
});

define.fmt({
  singleQuote: true,
});
