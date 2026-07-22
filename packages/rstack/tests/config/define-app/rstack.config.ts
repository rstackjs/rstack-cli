import { define } from 'rstack';

define.app({
  source: {
    define: {
      DEFINE_APP_TEST_VALUE: JSON.stringify('define.app works'),
    },
  },
});
