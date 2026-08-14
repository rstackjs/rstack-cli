// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app(async () => {
  const { pluginPreact } = await import('@rsbuild/plugin-preact');
  return {
    plugins: [pluginPreact()],
  };
});

define.test({
  setupFiles: ['./tests/rstest.setup.ts'],
});

define.lint(({ js, ts, reactHooksPlugin, reactPlugin }) => [
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
  reactPlugin.configs.recommended,
  reactHooksPlugin.configs.recommended,
]);

define.fmt({
  singleQuote: true,
});
