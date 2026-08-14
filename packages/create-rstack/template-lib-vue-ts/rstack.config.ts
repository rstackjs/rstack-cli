// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib(async () => {
  const { pluginVue } = await import('@rsbuild/plugin-vue');
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
    plugins: [pluginVue()],
  };
});

define.test({
  setupFiles: ['./tests/rstest.setup.ts'],
});

define.lint(({ js, ts }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
]);

define.fmt({
  singleQuote: true,
});
