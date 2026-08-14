// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib(async () => {
  const { pluginBabel } = await import('@rsbuild/plugin-babel');
  const { pluginSolid } = await import('@rsbuild/plugin-solid');
  return {
    lib: [
      {
        id: 'compiled',
        bundle: false,
        dts: true,
        plugins: [
          pluginBabel({
            include: /\.(?:jsx|tsx)$/,
          }),
          pluginSolid(),
        ],
      },
      {
        id: 'source',
        bundle: false,
        output: {
          filename: {
            js: '[name].jsx',
          },
        },
        tools: {
          swc: {
            detectSyntax: 'auto',
            jsc: {
              transform: {
                react: {
                  runtime: 'preserve',
                },
              },
            },
          },
          rspack: {
            module: {
              parser: {
                javascript: {
                  jsx: true,
                },
              },
            },
          },
        },
      },
    ],
    source: {
      entry: {
        index: ['./src/**'],
      },
    },
    output: {
      target: 'web',
    },
  };
});

define.test(async () => {
  const { pluginBabel } = await import('@rsbuild/plugin-babel');
  const { pluginSolid } = await import('@rsbuild/plugin-solid');
  return {
    setupFiles: ['./tests/rstest.setup.ts'],
    plugins: [
      pluginBabel({
        include: /\.(?:jsx|tsx)$/,
      }),
      pluginSolid(),
    ],
  };
});

define.lint(({ js, ts }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
]);

define.fmt({
  singleQuote: true,
});
