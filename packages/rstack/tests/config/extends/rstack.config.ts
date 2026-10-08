import { define } from 'rstack';
import { sharedConfig } from './shared.ts';

define.fmt({ singleQuote: false });
define.extends([
  sharedConfig,
  {
    fmt: { printWidth: 80 },
  },
]);
