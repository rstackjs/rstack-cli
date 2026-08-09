// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app(async () => {
  const { pluginBabel } = await import('@rsbuild/plugin-babel');
  const { pluginSolid } = await import('@rsbuild/plugin-solid');

  return {
    plugins: [
      pluginBabel({
        include: /\.(?:jsx|tsx)$/,
      }),
      pluginSolid(),
    ],
  };
});

define.test({
  setupFiles: ['./tests/rstest.setup.ts'],
});

define.lint(async () => {
  const { js, ts } = await import('rstack/lint');

  return [js.configs.recommended, ts.configs.recommended];
});

define.fmt({
  singleQuote: true,
});

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rs lint --fix', 'rs fmt'],
  '*.{json,jsonc,md,mdx,css,html,yml,yaml}': 'rs fmt',
});
