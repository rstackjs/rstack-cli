// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  syntax: 'es2023',
});

define.test({
  source: {
    tsconfigPath: './tests/tsconfig.json',
  },
});
