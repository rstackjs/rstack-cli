import { define } from 'rstack';

define.app({
  output: {
    filenameHash: false,
  },
  source: {
    entry: {
      index: './src/index.js',
    },
  },
});
