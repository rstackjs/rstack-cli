// @ts-check
// Configuration guide: https://rstack.rs/config
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

define.lint(({ js, rstestPlugin }) => [
  js.configs.recommended,
  {
    files: ['**/*.test.{js,jsx}'],
    ...rstestPlugin.configs.recommended,
  },
]);

define.fmt({
  plugins: ['prettier-plugin-svelte'],
  singleQuote: true,
});
