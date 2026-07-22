import { define } from 'rstack';

define.lint([
  { ignores: ['!src/test-temp-error.js'] },
  {
    files: ['src/**/*.js'],
    rules: {
      'no-debugger': 'error',
    },
  },
]);
