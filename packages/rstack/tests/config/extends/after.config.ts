import { define } from 'rstack';
import { sharedConfig } from './shared.ts';

define.extends([
  sharedConfig,
  {
    fmt: { printWidth: 80 },
  },
]);
define.fmt({ singleQuote: false });
