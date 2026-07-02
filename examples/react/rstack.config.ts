import { withRsbuildConfig } from '@rstest/adapter-rsbuild';
import { define } from 'rstack';

define.app(async () => {
  const { pluginReact } = await import('@rsbuild/plugin-react');
  return {
    plugins: [pluginReact()],
  };
});

define.test({
  extends: withRsbuildConfig(),
  setupFiles: ['./tests/rstest.setup.ts'],
});

// TODO: remove
export default {};
