// Configuration guide: https://rstack.rs/config
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

define.lint(({ js, ts }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
]);

define.fmt({
  plugins: ['prettier-plugin-svelte'],
  singleQuote: true,
});
