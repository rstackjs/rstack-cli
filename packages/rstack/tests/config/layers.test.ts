import type { ConfigParams } from 'rstack/app';
import { expect, rs, test } from 'rstack/test';
import {
  createConfigLayers,
  resolveConfigLayers,
  type ConfigLayer,
} from '../../src/configLayers.ts';

test('collects inherited layers before the project without resolving definitions', () => {
  const factory = rs.fn(() => ({}));
  const base = Object.freeze({ app: factory });
  const team = Object.freeze({ test: factory });
  const project = Object.freeze({ app: factory });
  const inherited = Object.freeze([base, team]);

  const layers = createConfigLayers(project, inherited);

  expect(layers).toEqual([base, team, project]);
  expect(layers[0]).toBe(base);
  expect(layers[2]).toBe(project);
  expect(inherited).toEqual([base, team]);
  expect(createConfigLayers(project)).toEqual([project]);
  expect(factory).not.toHaveBeenCalled();
});

test.each(['app', 'lib'] as const)(
  'passes native parameters unchanged to every %s factory',
  async (kind) => {
    const params: ConfigParams = {
      command: 'build',
      env: 'production',
      envMode: 'staging',
      meta: { caller: 'test' },
    };
    const baseConfig = { root: 'base' };
    const projectConfig = { root: 'project' };
    const base = rs.fn((_params: ConfigParams) => baseConfig);
    const project = rs.fn((_params: ConfigParams) =>
      Promise.resolve(projectConfig),
    );
    const layers = createConfigLayers({ [kind]: project }, [{ [kind]: base }]);

    const configs = await resolveConfigLayers(layers, kind, params);

    expect(configs).toEqual([baseConfig, projectConfig]);
    expect(configs[0]).toBe(baseConfig);
    expect(configs[1]).toBe(projectConfig);
    expect(base).toHaveBeenCalledExactlyOnceWith(params);
    expect(project).toHaveBeenCalledExactlyOnceWith(params);
    expect(base.mock.calls[0][0]).toBe(params);
    expect(project.mock.calls[0][0]).toBe(params);
  },
);

test('awaits layers sequentially and only resolves the selected tool', async () => {
  const started = Promise.withResolvers<void>();
  const ready = Promise.withResolvers<void>();
  const baseConfig = Object.freeze({ retry: 2 });
  const projectConfig = Object.freeze({ retry: 1 });
  const unrelated = rs.fn(() => {
    throw new Error('Unselected tool must stay lazy');
  });
  const project = rs.fn(() => projectConfig);
  const layers = createConfigLayers({ test: project, app: unrelated }, [
    {
      async test() {
        started.resolve();
        await ready.promise;
        return baseConfig;
      },
      fmt: unrelated,
    },
  ]);

  const resolving = resolveConfigLayers(layers, 'test');
  await started.promise;
  try {
    expect(project).not.toHaveBeenCalled();
  } finally {
    ready.resolve();
  }
  const configs = await resolving;

  expect(configs).toEqual([baseConfig, projectConfig]);
  expect(configs[0]).toBe(baseConfig);
  expect(configs[1]).toBe(projectConfig);
  expect(project).toHaveBeenCalledExactlyOnceWith();
  expect(unrelated).not.toHaveBeenCalled();
});

test.each(['doc', 'test', 'lint', 'fmt'] as const)(
  'resolves %s values and factories without injecting arguments',
  async (kind) => {
    const values = {
      doc: { title: 'Docs' },
      test: { retry: 2 },
      lint: [],
      fmt: { singleQuote: true },
    };
    const factory = rs.fn(() => Promise.resolve(values[kind]));
    const layers = createConfigLayers({ [kind]: factory }, [
      { [kind]: values[kind] },
    ]);

    const configs = await resolveConfigLayers(layers, kind);

    expect(configs).toEqual([values[kind], values[kind]]);
    expect(configs[0]).toBe(values[kind]);
    expect(configs[1]).toBe(values[kind]);
    expect(factory).toHaveBeenCalledExactlyOnceWith();
  },
);

test('skips missing definitions while preserving explicitly empty configs', async () => {
  const emptyConfig = {};
  const emptyLint: ConfigLayer = { lint: [] };
  const layers = createConfigLayers({ test: emptyConfig }, [{}, emptyLint]);

  expect(await resolveConfigLayers(layers, 'test')).toEqual([emptyConfig]);
  expect(await resolveConfigLayers(layers, 'lint')).toEqual([[]]);
  expect(await resolveConfigLayers(layers, 'fmt')).toEqual([]);
});

test('preserves staged task generators without invoking them', async () => {
  const task = rs.fn((_files: readonly string[]) => 'rs lint');
  const generator = rs.fn((_files: readonly string[]) =>
    Promise.resolve(['rs fmt']),
  );
  const tasks = { '*.ts': task };
  const layers = createConfigLayers({ staged: generator }, [{ staged: tasks }]);

  const configs = await resolveConfigLayers(layers, 'staged');

  expect(configs[0]).toBe(tasks);
  expect(configs[1]).toBe(generator);
  expect(task).not.toHaveBeenCalled();
  expect(generator).not.toHaveBeenCalled();
});

test('stops at a failed factory and preserves its error', async () => {
  const error = new Error('Invalid shared config');
  const project = rs.fn(() => ({}));
  const layers = createConfigLayers({ fmt: project }, [
    {
      fmt: () => Promise.reject(error),
    },
  ]);

  await expect(resolveConfigLayers(layers, 'fmt')).rejects.toBe(error);
  expect(project).not.toHaveBeenCalled();
});

test('keeps simultaneous resolutions with different parameters independent', async () => {
  const factory = rs.fn(async ({ env }: ConfigParams) => {
    await Promise.resolve();
    return { root: env };
  });
  const layers = createConfigLayers({ app: factory });

  const configs = await Promise.all([
    resolveConfigLayers(layers, 'app', { command: 'build', env: 'production' }),
    resolveConfigLayers(layers, 'app', { command: 'dev', env: 'development' }),
  ]);

  expect(configs).toEqual([
    [{ root: 'production' }],
    [{ root: 'development' }],
  ]);
  expect(factory).toHaveBeenCalledTimes(2);
});
