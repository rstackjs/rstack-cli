// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  dts: true,
  syntax: ['node 22'],
});

define.lint(async () => {
  const { js, ts } = await import('rstack/lint');
  return [js.configs.recommended, ts.configs.recommended];
});
