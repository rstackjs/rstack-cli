import { define } from 'rstack';

define.app({
  source: {
    define: {
      PROJECT_LABEL: JSON.stringify('pkg-a'),
    },
  },
});

define.test({
  globals: true,
  include: ['./entry.ts'],
});
