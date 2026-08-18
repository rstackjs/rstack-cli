// @ts-check
// Configuration guide: https://rstack.rs/config
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
