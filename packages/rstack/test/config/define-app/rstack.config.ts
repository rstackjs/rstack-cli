import { define } from 'rstack';

define.app({
  output: {
    filenameHash: false,
  },
  source: {
    entry: {
      index: './src/index.js',
    },
    define: {
      DEFINE_APP_TEST_VALUE: JSON.stringify('define.app works'),
    },
  },
});
