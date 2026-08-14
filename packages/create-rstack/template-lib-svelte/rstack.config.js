// @ts-check
// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib(async () => {
  const { pluginSvelte } = await import('@rsbuild/plugin-svelte');

  return {
    bundle: false,
    source: {
      entry: {
        index: ['./src/**'],
      },
    },
    output: {
      target: 'web',
    },
    plugins: [pluginSvelte()],
  };
});

define.test({
  testEnvironment: 'happy-dom',
});

define.lint(({ js }) => [js.configs.recommended]);

define.fmt({
  plugins: ['prettier-plugin-svelte'],
  singleQuote: true,
});
