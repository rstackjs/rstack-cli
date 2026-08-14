// @ts-check
// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app(async () => {
  const { pluginSvelte } = await import('@rsbuild/plugin-svelte');

  return {
    plugins: [pluginSvelte()],
  };
});

define.test({
  setupFiles: ['./tests/rstest.setup.js'],
});

define.lint(({ js }) => [js.configs.recommended]);

define.fmt({
  plugins: ['prettier-plugin-svelte'],
  singleQuote: true,
});
