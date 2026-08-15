// Configuration guide: https://rstack.rs/config
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

define.lint(({ js, ts, reactPlugin, reactHooksPlugin }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
  reactPlugin.configs.recommended,
  reactHooksPlugin.configs.recommended,
]);

define.fmt({
  singleQuote: true,
});
