import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { ConfigParams } from 'rstack/app';
import { expect, rs, test } from 'rstack/test';

// Bypass Rstest's replacement of @rstest/core with its test runtime APIs.
// TODO: Import the source directly after upgrading to a Rstest version that fixes
// https://github.com/web-infra-dev/rstest/issues/1891.
const { resolveRstestConfig } = createRequire(import.meta.url)(
  '../../dist/rstestConfig.js',
) as typeof import('../../src/rstestConfig.ts');

const params: ConfigParams = { command: 'build', env: 'production' };

test('merges test layers using native Rstest rules', async () => {
  const config = await resolveRstestConfig(
    [
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
    ],
    params,
  );

  expect(config).toMatchObject({
    extends: { testTimeout: 5000 },
    retry: 2,
    setupFiles: ['./base.ts', './project.ts'],
    reporters: ['dot'],
    projects: ['./base.config.ts', './project.config.ts'],
  });
});

test('shares the merged app config across projects and prefers it over lib', async () => {
  const app = rs.fn(({ env }: ConfigParams) => ({
    source: { define: { ENV: env, VALUE: 'base' } },
  }));
  const lib = rs.fn(() => ({}));
  const config = await resolveRstestConfig(
    [
      { app, lib, test: { projects: [{ name: 'base' }] } },
      {
        app: { source: { define: { VALUE: 'project' } } },
        test: {
          projects: [
            { name: 'project' },
            { name: 'explicit', extends: undefined },
            './external.config.ts',
          ],
        },
      },
    ],
    params,
  );

  const first = config.projects?.[0];
  assert(
    first && typeof first !== 'string' && typeof first.extends === 'function',
  );
  expect(await first.extends(first)).toMatchObject({
    source: { define: { ENV: 'production', VALUE: 'project' } },
  });
  expect(config.projects).toEqual([
    { name: 'base', extends: first.extends },
    { name: 'project', extends: first.extends },
    { name: 'explicit', extends: undefined },
    './external.config.ts',
  ]);
  expect(app).toHaveBeenCalledExactlyOnceWith(params);
  expect(lib).not.toHaveBeenCalled();
});

test('inherits merged lib config when no layer defines app', async () => {
  const config = await resolveRstestConfig(
    [
      { lib: { source: { define: { SHARED: true, VALUE: 'base' } } } },
      { lib: { source: { define: { VALUE: 'project' } } } },
    ],
    params,
  );

  assert(typeof config.extends === 'function');
  expect(await config.extends(config)).toMatchObject({
    source: { define: { SHARED: true, VALUE: 'project' } },
  });
});

test.each([
  { extends: undefined },
  { projects: ['./external.config.ts', { name: 'explicit', extends: {} }] },
])(
  'skips build config factories when inheritance is disabled: %j',
  async (testConfig) => {
    const build = rs.fn(() => ({}));
    await resolveRstestConfig(
      [{ app: build, lib: build, test: { retry: 1 } }, { test: testConfig }],
      params,
    );

    expect(build).not.toHaveBeenCalled();
  },
);
