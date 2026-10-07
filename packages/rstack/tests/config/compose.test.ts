import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { Configs } from '../../src/config.ts';
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

const params = { command: 'build', env: 'production' } as const;

test('preserves single definitions and leaves missing tools absent', async () => {
  const app = rs.fn(() => ({}));
  const base: Configs = { app, lint: [] };
  const project: Configs = { fmt: {} };

  expect(await composeConfigLayers([])).toEqual({});
  expect(await composeConfigLayers([base])).toBe(base);
  const configs = await composeConfigLayers([base, project]);
  expect(configs).toEqual({ app, lint: base.lint, fmt: project.fmt });
  expect(configs.lint).toBe(base.lint);
  expect(configs.fmt).toBe(project.fmt);
  expect(app).not.toHaveBeenCalled();
});

test('composes tool definitions lazily and resolves each factory once', async () => {
  const app = rs.fn(() => ({ source: { define: { APP: true } } }));
  const lib = rs.fn(() => ({ lib: [{ format: 'esm' as const }] }));
  const doc = rs.fn(() => Promise.resolve({ title: 'Shared' }));
  const lint = rs.fn(() =>
    Promise.resolve([{ rules: { 'no-debugger': 'error' as const } }]),
  );
  const fmt = rs.fn(() => ({ semi: false }));
  const staged = rs.fn(() => 'rs check');
  const configs = await composeConfigLayers([
    { app, lib, doc, lint, fmt, staged: { '*.ts': 'rs lint' } },
    {
      app: {},
      lib: {},
      doc: { title: 'Project' },
      lint: [],
      fmt: { singleQuote: true },
      staged,
    },
  ]);

  for (const factory of [app, lib, doc, lint, fmt, staged]) {
    expect(factory).not.toHaveBeenCalled();
  }
  expect(await resolveConfigLayers([configs], 'app', params)).toEqual([
    { source: { define: { APP: true } } },
  ]);
  expect(lib).not.toHaveBeenCalled();
  expect(doc).not.toHaveBeenCalled();
  expect(await resolveConfigLayers([configs], 'lib', params)).toEqual([
    { lib: [{ format: 'esm' }] },
  ]);
  expect(await resolveConfigLayers([configs], 'doc')).toEqual([
    { title: 'Project' },
  ]);
  expect(await resolveConfigLayers([configs], 'lint')).toEqual([
    [{ rules: { 'no-debugger': 'error' } }],
  ]);
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
  expect(configs.staged).toBe(staged);
  expect(staged).not.toHaveBeenCalled();
  expect(app).toHaveBeenCalledExactlyOnceWith(params);
  expect(lib).toHaveBeenCalledExactlyOnceWith(params);
  for (const factory of [doc, lint, fmt]) {
    expect(factory).toHaveBeenCalledExactlyOnceWith();
  }
});

test('defers test inheritance until the consumer resolves the composed config', async () => {
  const app = rs.fn(() => ({ source: { define: { SHARED: true } } }));
  const configs = await composeConfigLayers([
    { app, test: { retry: 1 } },
    {
      app: { source: { define: { PROJECT: true } } },
      test: { projects: [{ name: 'a' }, { name: 'b' }] },
    },
  ]);
  const raw = await resolveConfigLayers([configs], 'test');
  expect(raw).toEqual([{ retry: 1, projects: [{ name: 'a' }, { name: 'b' }] }]);
  expect(app).not.toHaveBeenCalled();

  const config = await resolveRstestConfig([configs], params);
  const first = config.projects?.[0];
  assert(
    first && typeof first !== 'string' && typeof first.extends === 'function',
  );
  expect(config).toEqual({
    retry: 1,
    projects: [
      { name: 'a', extends: first.extends },
      { name: 'b', extends: first.extends },
    ],
  });
  expect(await first.extends(first)).toMatchObject({
    source: { define: { SHARED: true, PROJECT: true } },
  });
  expect(app).toHaveBeenCalledExactlyOnceWith(params);
});
