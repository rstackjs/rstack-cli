// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';
import { svelteDtsPlugin } from './scripts/rslib-plugin-svelte-dts.ts';

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
    plugins: [pluginSvelte(), svelteDtsPlugin()],
  };
});

define.test({
  testEnvironment: 'happy-dom',
});

define.lint(({ js, ts }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
]);

define.fmt({
  plugins: ['prettier-plugin-svelte'],
  singleQuote: true,
});
