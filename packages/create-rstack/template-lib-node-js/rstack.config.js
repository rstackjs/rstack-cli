// @ts-check
// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  syntax: ['node 22'],
});

define.test({
  // Configure Rstest
});

define.lint(async () => {
  const { js } = await import('rstack/lint');

  return [js.configs.recommended];
});
