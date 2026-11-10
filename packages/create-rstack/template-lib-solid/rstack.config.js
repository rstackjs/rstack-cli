// @ts-check
// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib(async () => {
  const { pluginBabel } = await import('@rsbuild/plugin-babel');
  const { pluginSolid } = await import('@rsbuild/plugin-solid');
  return {
    lib: [
      {
        id: 'compiled',
        plugins: [
          pluginBabel({
            include: /\.(?:jsx|tsx)$/,
          }),
          pluginSolid(),
        ],
      },
      {
        id: 'source',
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
    bundle: false,
    output: {
      target: 'web',
    },
  };
});

define.test(async () => {
  const { pluginBabel } = await import('@rsbuild/plugin-babel');
  const { pluginSolid } = await import('@rsbuild/plugin-solid');
  return {
    setupFiles: ['./tests/rstest.setup.js'],
    plugins: [
      pluginBabel({
        include: /\.(?:jsx|tsx)$/,
      }),
      pluginSolid(),
    ],
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
  singleQuote: true,
});
