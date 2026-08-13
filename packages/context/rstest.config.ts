import { defineConfig } from '@rstest/core';

export default defineConfig({
  include: ['./tests/**/*.test.ts'],
  source: {
    tsconfigPath: './tests/tsconfig.json',
  },
});
