import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { expect, rs, test } from 'rstack/test';
import {
  composeConfigLayers,
  resolveConfigLayers,
} from '../../src/configLayers.ts';
import { resolveFmtConfig } from '../../src/fmt/config.ts';
import { resolveRstestConfig } from '../../src/rstestConfig.ts';

// TODO: Import the source directly after upgrading Rstest to fix
// https://github.com/web-infra-dev/rstest/issues/1891.
rs.mock(
  '../../src/rstestConfig.ts',
  () =>
    createRequire(import.meta.url)(
      '../../dist/rstestConfig.js',
    ) as typeof import('../../src/rstestConfig.ts'),
);

test('preserves single definitions and leaves missing tools absent', async () => {
  const app = rs.fn(() => ({}));
  const base = { app };
  const fmt = {};

  expect(await composeConfigLayers([])).toEqual({});
  expect(await composeConfigLayers([base])).toBe(base);
  const configs = await composeConfigLayers([base, { fmt }]);
  expect(configs).toEqual({ app, fmt });
  expect(configs.fmt).toBe(fmt);
  expect(app).not.toHaveBeenCalled();
});

test('resolves only the requested tool and preserves staged task generators', async () => {
  const app = rs.fn(() => ({}));
  const fmt = rs.fn(() => ({ semi: false }));
  const staged = rs.fn(() => 'rs check');
  const configs = await composeConfigLayers([
    { app, fmt, staged: { '*.ts': 'rs lint' } },
    { app: {}, fmt: { singleQuote: true }, staged },
  ]);

  expect(fmt).not.toHaveBeenCalled();
  expect(
    await resolveFmtConfig({
      layers: [configs],
      configFilePath: '/project/rstack.config.ts',
      cwd: '/other',
    }),
  ).toEqual({
    rootPath: '/project',
    baseOptions: { semi: false, singleQuote: true },
    overrides: [],
    ignorePatterns: [],
  });
  expect(fmt).toHaveBeenCalledExactlyOnceWith();
  expect(app).not.toHaveBeenCalled();
  expect(configs.staged).toBe(staged);
  expect(staged).not.toHaveBeenCalled();
});

test('applies automatic inheritance after merging test definitions', async () => {
  const app = rs.fn(() => ({ source: { define: { SHARED: true } } }));
  const configs = await composeConfigLayers([
    { app, test: { retry: 1 } },
    {
      app: { source: { define: { PROJECT: true } } },
      test: { testTimeout: 5000 },
    },
  ]);

  expect(await resolveConfigLayers([configs], 'test')).toEqual([
    { retry: 1, testTimeout: 5000 },
  ]);
  expect(app).not.toHaveBeenCalled();

  const params = { command: 'build', env: 'production' } as const;
  const config = await resolveRstestConfig([configs], params);
  assert(typeof config.extends === 'function');
  expect(config).toEqual({
    retry: 1,
    testTimeout: 5000,
    extends: config.extends,
  });
  expect(await config.extends(config)).toMatchObject({
    source: { define: { SHARED: true, PROJECT: true } },
  });
  expect(app).toHaveBeenCalledExactlyOnceWith(params);
});
