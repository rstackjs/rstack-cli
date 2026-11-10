// @ts-check
// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib(async () => {
  const { pluginSvelte } = await import('@rsbuild/plugin-svelte');
  return {
    bundle: false,
    output: {
      target: 'web',
    },
    plugins: [pluginSvelte()],
  };
});

define.lint(({ js, rstestPlugin }) => [
  js.configs.recommended,
  {
    files: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    ...rstestPlugin.configs.recommended,
  },
]);

define.fmt({
  plugins: ['prettier-plugin-svelte'],
  singleQuote: true,
});
