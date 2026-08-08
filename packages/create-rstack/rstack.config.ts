// Rstack configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  syntax: 'es2023',
});

define.test({
  include: ['./tests/**/*.test.ts'],
  source: {
    tsconfigPath: './tests/tsconfig.json',
  },
});
