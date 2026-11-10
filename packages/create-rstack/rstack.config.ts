// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  syntax: 'es2023',
  tools: {
    rspack: {
      experiments: {
        runtimeMode: 'rspack',
      },
    },
  },
});

define.test({
  include: ['./tests/**/*.test.ts'],
  source: {
    tsconfigPath: './tests/tsconfig.json',
  },
});
