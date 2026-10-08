import { fileURLToPath } from 'node:url';
import type { RstackConfig } from 'rstack';

export const sharedConfig: RstackConfig = {
  extends: [{ fmt: { semi: false, printWidth: 100 } }],
  app: ({ env }) => ({ source: { define: { ENV: env } } }),
  lib: { lib: [{ format: 'esm' }] },
  doc: { root: 'docs' },
  test: { setupFiles: [fileURLToPath(new URL('./setup.ts', import.meta.url))] },
  lint: ({ defineConfig }) =>
    defineConfig([{ rules: { 'no-debugger': 'error' } }]),
  fmt: { singleQuote: true },
  staged: { '*.ts': 'rs lint' },
};
