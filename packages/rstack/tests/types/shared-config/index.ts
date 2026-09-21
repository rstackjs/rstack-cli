import type { RstackConfig } from '../../../src/config.ts';

export const baseConfig: RstackConfig = {
  app: { source: { entry: { index: './src/index.ts' } } },
  lib: { lib: [{ format: 'esm' }] },
  doc: { title: 'Docs' },
  test: { retry: 2 },
  lint: [],
  fmt: { singleQuote: true },
  staged: { '*.ts': 'rs lint' },
};

export const syncConfig: RstackConfig = {
  extends: [baseConfig] as const,
  app: ({ command }) => ({
    source: { define: { COMMAND: JSON.stringify(command) } },
  }),
  lib: ({ env }) => ({
    lib: [{ format: 'esm' }],
    mode: env === 'production' ? 'production' : 'development',
  }),
  test: () => ({ retry: 1 }),
  lint: ({ js, ts }) => [js.configs.recommended, ts.configs.recommended],
  fmt: () => ({ singleQuote: true }),
  staged: (files) => (files.length ? ['rs lint'] : []),
};

export const asyncConfig: RstackConfig = {
  app: ({ env }) =>
    Promise.resolve({
      source: { define: { ENV: JSON.stringify(env) } },
    }),
  lib: () => Promise.resolve({ lib: [{ format: 'esm' }] }),
  doc: () => Promise.resolve({ title: 'Docs' }),
  test: () => Promise.resolve({ retry: 2 }),
  lint: ({ js }) => Promise.resolve([js.configs.recommended]),
  fmt: () => Promise.resolve({ singleQuote: true }),
  staged: (files) => Promise.resolve(files.length ? ['rs fmt'] : []),
};

export function sharedConfig(options: { retry?: number } = {}): RstackConfig {
  return {
    extends: [syncConfig, asyncConfig],
    test: { retry: options.retry ?? 2 },
  };
}

export const invalidConfig: RstackConfig = {
  // @ts-expect-error Lint factories receive tool exports, not build parameters.
  lint: (_params: { env: string }) => [],
};
