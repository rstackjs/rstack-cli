// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app(async () => {
  const { pluginSvelte } = await import('@rsbuild/plugin-svelte');

  return {
    plugins: [pluginSvelte()],
  };
});

define.test({
  setupFiles: ['./tests/rstest.setup.ts'],
});

define.lint(async () => {
  const { js, ts } = await import('rstack/lint');

  return [js.configs.recommended, ts.configs.recommended];
});

define.fmt({
  plugins: ['prettier-plugin-svelte'],
  singleQuote: true,
});
