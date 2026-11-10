// Configuration guide: https://rstack.rs/config
import { withRslibConfig } from '@rstest/adapter-rslib';
import { define } from 'rstack';

define.test(() => {
  return {
    // Temporary projects and fixture projects may contain files that match
    // Rstest's test glob.
    exclude: [
      '**/test-temp-*/**',
      // Project-loader fixtures run the CLI with their own test globs.
      '**/tests/config/project-loader/packages/**',
    ],
    extends: withRslibConfig(),
    testTimeout: 30_000,
    source: {
      tsconfigPath: './tests/tsconfig.json',
    },
  };
});
