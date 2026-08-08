// @ts-check
// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.app(async () => {
  const { pluginVue } = await import('@rsbuild/plugin-vue');

  return {
    plugins: [pluginVue()],
  };
});

define.test({
  setupFiles: ['./tests/rstest.setup.js'],
});

define.lint(async () => {
  const { js } = await import('rstack/lint');

  return [js.configs.recommended];
});
