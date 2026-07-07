import { define } from 'rstack';

define.lib({
  lib: [{}],
  source: {
    define: {
      DEFINE_LIB_TEST_VALUE: JSON.stringify('define.lib works'),
    },
  },
});
