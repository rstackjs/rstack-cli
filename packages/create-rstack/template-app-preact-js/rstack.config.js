// @ts-check
// Rstack configuration guide: https://rstack.rs/config
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

define.lint(async () => {
  const { js, reactHooksPlugin, reactPlugin } = await import('rstack/lint');

  return [
    js.configs.recommended,
    reactPlugin.configs.recommended,
    reactHooksPlugin.configs.recommended,
  ];
});

define.fmt({
  singleQuote: true,
});
