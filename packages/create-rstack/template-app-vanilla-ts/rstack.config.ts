// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app({
  // Configure Rsbuild
});

define.test({
  setupFiles: ['./tests/rstest.setup.ts'],
});

define.lint(async () => {
  const { js, ts } = await import('rstack/lint');

  return [js.configs.recommended, ts.configs.recommended];
});

define.fmt({
  singleQuote: true,
});
