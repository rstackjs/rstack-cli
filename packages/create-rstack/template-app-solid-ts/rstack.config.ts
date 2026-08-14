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

define.lint(({ js, ts }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
]);

define.fmt({
  singleQuote: true,
});
