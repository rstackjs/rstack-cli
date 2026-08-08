// @ts-check
// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app({
  // Configure Rsbuild
});

define.test({
  // Configure Rstest
});

define.lint(async () => {
  const { js } = await import('rstack/lint');

  return [js.configs.recommended];
});
