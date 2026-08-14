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

define.lint(({ js, ts, reactPlugin, reactHooksPlugin }) => [
  js.configs.recommended,
  ts.configs.recommended,
  reactPlugin.configs.recommended,
  reactHooksPlugin.configs.recommended,
]);
