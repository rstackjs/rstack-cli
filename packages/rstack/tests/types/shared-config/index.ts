import { define, type RstackConfig } from 'rstack';

export const baseConfig: RstackConfig = {
  app: { source: { entry: { index: './src/index.ts' } } },
  lib: { lib: [{ format: 'esm' }] },
  doc: { title: 'Docs' },
  test: { retry: 2 },
  lint: [],
  fmt: { singleQuote: true },
  staged: { '*.ts': 'rs lint' },
};

export const sharedConfig: RstackConfig = {
  extends: [
    baseConfig,
    { lint: ({ js }) => Promise.resolve([js.configs.recommended]) },
  ] as const,
  app: ({ command }) => ({
    source: { define: { COMMAND: JSON.stringify(command) } },
  }),
  lint: ({ js, ts }) => [js.configs.recommended, ts.configs.recommended],
  staged: (files) => (files.length ? ['rs lint'] : []),
};

export const invalidConfig: RstackConfig = {
  // @ts-expect-error Lint factories receive tool exports, not build parameters.
  lint: (_params: { env: string }) => [],
};

define.extends([sharedConfig] as const);

// @ts-expect-error Pass shared config objects, not config factories.
define.extends([() => sharedConfig]);
