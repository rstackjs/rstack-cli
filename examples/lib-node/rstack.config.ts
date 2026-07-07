import { define } from 'rstack';

define.lib({
  lib: [{ syntax: ['node 22'], dts: true }],
});

define.lint(async () => {
  const { js, ts } = await import('rstack/lint');
  return [js.configs.recommended, ts.configs.recommended];
});
