import { define } from 'rstack';

define.app({
  source: {
    define: {
      RSTACK_INHERITED_CONFIG: JSON.stringify('app'),
    },
  },
});

define.lib({
  lib: [{}],
  source: {
    define: {
      RSTACK_INHERITED_CONFIG: JSON.stringify('lib'),
    },
  },
});

define.test({
  include: ['./fixture.ts'],
});
