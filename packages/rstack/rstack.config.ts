import { define } from 'rstack';

define.test(async () => {
  const { withRslibConfig } = await import('@rstest/adapter-rslib');

  // Disable color in test
  process.env.NO_COLOR = '1';

  return {
    extends: withRslibConfig(),
    source: {
      tsconfigPath: './test/tsconfig.json',
    },
  };
});
