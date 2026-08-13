// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib(async () => {
  const { pluginReact } = await import('@rsbuild/plugin-react');

  return {
    bundle: false,
    dts: true,
    source: {
      entry: {
        index: ['./src/**'],
      },
    },
    output: {
      target: 'web',
    },
    plugins: [pluginReact()],
  };
});

define.test({
  setupFiles: ['./tests/rstest.setup.ts'],
});

define.lint(async () => {
  const { js, ts, reactPlugin, reactHooksPlugin } = await import('rstack/lint');

  return [
    js.configs.recommended,
    ts.configs.recommendedTypeChecked,
    reactPlugin.configs.recommended,
    reactHooksPlugin.configs.recommended,
  ];
});

define.fmt({
  singleQuote: true,
});
