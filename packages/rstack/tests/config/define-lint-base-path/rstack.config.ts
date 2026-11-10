import { define } from 'rstack';

define.lint([
  {
    basePath: 'src',
    files: ['index.js'],
    rules: {
      'no-alert': 'error',
    },
  },
]);
