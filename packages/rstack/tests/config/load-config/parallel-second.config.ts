import { define } from 'rstack';

define.extends([
  {
    fmt: { semi: true },
  },
]);

define.app({ root: 'second' });
define.lib({});
