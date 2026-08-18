// @ts-check
// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app(async () => {
  const { pluginVue } = await import('@rsbuild/plugin-vue');
  return {
    plugins: [pluginVue()],
  };
});

define.test({
  setupFiles: ['./tests/rstest.setup.js'],
});

define.lint(({ js, rstestPlugin }) => [
  js.configs.recommended,
  {
    files: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    ...rstestPlugin.configs.recommended,
  },
]);

define.fmt({
  singleQuote: true,
});
