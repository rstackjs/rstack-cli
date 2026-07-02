import { withRsbuildConfig } from '@rstest/adapter-rsbuild';
import { define } from 'rstack';

define.test({
  extends: withRsbuildConfig(),
  setupFiles: ['./tests/rstest.setup.ts'],
});

// TODO: remove
export default {}