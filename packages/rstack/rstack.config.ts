// Configuration guide: https://rstack.rs/config
import { withRslibConfig } from '@rstest/adapter-rslib';
import { define } from 'rstack';

define.test(() => {
  // Disable color in test
  process.env.NO_COLOR = '1';

  return {
    // Temporary projects may contain files that match Rstest's test glob.
    exclude: ['**/test-temp-*/**'],
    extends: withRslibConfig(),
    testTimeout: 30_000,
    source: {
      tsconfigPath: './tests/tsconfig.json',
    },
  };
});
