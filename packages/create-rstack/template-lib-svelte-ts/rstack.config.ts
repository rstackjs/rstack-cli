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

define.lint(async () => {
  const { js, ts } = await import('rstack/lint');

  return [js.configs.recommended, ts.configs.recommended];
});

define.fmt({
  plugins: ['prettier-plugin-svelte'],
  singleQuote: true,
});

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rs lint --fix', 'rs fmt'],
  '*.{json,jsonc,md,mdx,css,html,yml,yaml,svelte}': 'rs fmt',
});
