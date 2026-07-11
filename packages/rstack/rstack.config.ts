import { define } from 'rstack';

define.test(() => {
  // Disable color in test
  process.env.NO_COLOR = '1';

  return {
    source: {
      tsconfigPath: './test/tsconfig.json',
    },
  };
});
