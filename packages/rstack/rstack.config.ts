import { define } from 'rstack';

// Disable color in test
process.env.NO_COLOR = '1';

define.test({
  source: {
    tsconfigPath: './test/tsconfig.json',
  },
});
