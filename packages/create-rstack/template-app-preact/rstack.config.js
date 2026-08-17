// @ts-check
// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app(async () => {
  const { pluginPreact } = await import('@rsbuild/plugin-preact');
  return {
    plugins: [pluginPreact()],
  };
});

define.test({
  setupFiles: ['./tests/rstest.setup.js'],
});

define.lint(({ js, reactHooksPlugin, reactPlugin }) => [
  js.configs.recommended,
  reactPlugin.configs.recommended,
  reactHooksPlugin.configs.recommended,
]);

define.fmt({
  singleQuote: true,
});
