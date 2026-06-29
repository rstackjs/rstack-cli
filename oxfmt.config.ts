import { defineConfig } from 'oxfmt';

export default defineConfig({
  singleQuote: true,
  ignorePatterns: ['dist/**', 'pnpm-lock.yaml'],
});
