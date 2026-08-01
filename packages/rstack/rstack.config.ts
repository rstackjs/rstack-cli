import { define } from 'rstack';

define.test(async () => {
  const { withRslibConfig } = await import('@rstest/adapter-rslib');

  // Disable color in test
  process.env.NO_COLOR = '1';

  return {
    // Temporary projects may contain files that match Rstest's test glob.
    exclude: ['**/test-temp-*/**'],
    extends: withRslibConfig(),
    source: {
      tsconfigPath: './tests/tsconfig.json',
    },
  };
});
