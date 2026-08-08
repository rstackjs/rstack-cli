// @ts-check
// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app(async () => {
  const { pluginReact } = await import('@rsbuild/plugin-react');

  return {
    plugins: [pluginReact()],
  };
});

define.test({
  // Configure Rstest
});

define.lint(async () => {
  const { js, reactHooksPlugin, reactPlugin } = await import('rstack/lint');

  return [
    js.configs.recommended,
    reactPlugin.configs.recommended,
    reactHooksPlugin.configs.recommended,
  ];
});
