import { createRequire } from 'node:module';
import { expect, test } from 'rstack/test';

// Bypass Rstest's replacement of @rstest/core with its test runtime APIs.
const { resolveRstestConfig } = createRequire(import.meta.url)(
  '../../dist/rstestConfig.js',
) as typeof import('../../src/rstestConfig.ts');

test('merges test layers using native Rstest rules', async () => {
  const config = await resolveRstestConfig([
    {
      test: {
        extends: { testTimeout: 5000 },
        retry: 1,
        setupFiles: ['./base.ts'],
        reporters: ['default'],
        projects: ['./base.config.ts'],
      },
    },
    {
      test: {
        retry: 2,
        setupFiles: ['./project.ts'],
        reporters: ['dot'],
        projects: ['./project.config.ts'],
      },
    },
  ]);

  expect(config).toMatchObject({
    extends: { testTimeout: 5000 },
    retry: 2,
    setupFiles: ['./base.ts', './project.ts'],
    reporters: ['dot'],
    projects: ['./base.config.ts', './project.config.ts'],
  });
});
