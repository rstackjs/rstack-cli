import { define } from 'rstack';

define.extends([
  {
    fmt: { semi: true },
  },
]);

define.app({ root: 'failing' });
throw new Error('parallel config error');
