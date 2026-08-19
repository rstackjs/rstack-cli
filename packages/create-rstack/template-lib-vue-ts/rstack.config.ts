// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib(async () => {
  const { pluginVue } = await import('@rsbuild/plugin-vue');
  return {
    bundle: false,
    output: {
      target: 'web',
    },
    plugins: [pluginVue()],
  };
});

define.test({
  setupFiles: ['./tests/rstest.setup.ts'],
});

define.lint(({ js, ts, rstestPlugin }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
  {
    files: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    ...rstestPlugin.configs.recommended,
  },
]);

define.fmt({
  singleQuote: true,
});
