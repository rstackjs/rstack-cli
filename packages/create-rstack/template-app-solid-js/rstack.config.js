// @ts-check
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
  // Configure Rstest
});

define.lint(async () => {
  const { js } = await import('rstack/lint');

  return [js.configs.recommended];
});
