import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ConfigParams, RsbuildConfig } from '@rsbuild/core';
import { expect, test } from 'rstack/test';
import {
  appendBuildContextPlugin,
  createBuildContextPlugin,
  readContextWorkspaceStatus,
  type ResolvedContextWorkspace,
} from '../../src/context/index.ts';

type BeforeHook = (context: { environments: Record<string, unknown> }) => Promise<void> | void;

type ObserverHooks = {
  beforeBuild?: BeforeHook;
  beforeDevCompile?: BeforeHook;
  afterEnvironmentCompile?: (context: AfterCompileContext) => Promise<void> | void;
};

type AfterCompileContext = {
  environment: unknown;
  isFirstCompile: boolean;
  isWatch: boolean;
  stats?: {
    hasErrors: () => boolean;
    hasWarnings: () => boolean;
    toJson: (options: unknown) => unknown;
  };
  time: number;
};

type ObserverHarness = {
  hooks: ObserverHooks;
  warnings: string[];
};

const withTempWorkspace = async (
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-build-context-'));

  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

const getObserverHarness = (
  plugin: ReturnType<typeof createBuildContextPlugin>,
  { throwOnWarning = false }: { throwOnWarning?: boolean } = {},
): ObserverHarness => {
  const hooks: ObserverHooks = {};
  const warnings: string[] = [];

  plugin.setup?.({
    logger: {
      warn: (message: string) => {
        warnings.push(message);
        if (throwOnWarning) {
          throw new Error('broken logger');
        }
      },
    },
    onBeforeBuild: (callback: BeforeHook) => {
      hooks.beforeBuild = callback;
    },
    onBeforeDevCompile: (callback: BeforeHook) => {
      hooks.beforeDevCompile = callback;
    },
    onAfterEnvironmentCompile: (
      callback: (context: AfterCompileContext) => Promise<void> | void,
    ) => {
      hooks.afterEnvironmentCompile = callback;
    },
  } as never);

  return { hooks, warnings };
};

const getObserverHooks = (plugin: ReturnType<typeof createBuildContextPlugin>): ObserverHooks =>
  getObserverHarness(plugin).hooks;

const createEnvironment = (name: string, target: string) => ({
  config: { output: { target } },
  name,
});

const createStats = ({
  hash = 'hash',
  hasErrors = false,
  hasWarnings = false,
  json = {},
}: {
  hash?: string;
  hasErrors?: boolean;
  hasWarnings?: boolean;
  json?: Record<string, unknown>;
}) => {
  const calls: unknown[] = [];

  return {
    calls,
    hasErrors: () => hasErrors,
    hasWarnings: () => hasWarnings,
    toJson: (options: unknown) => {
      calls.push(options);
      return { hash, ...json };
    },
  };
};

const invokeAfter = async (hooks: ObserverHooks, context: AfterCompileContext): Promise<void> => {
  expect(hooks.afterEnvironmentCompile).toBeDefined();
  await hooks.afterEnvironmentCompile!(context);
};

const collectContextId = async ({
  workspaceRoot,
  workspace,
  configPath,
  producer = 'rsbuild',
  product = 'application',
  params = { command: 'build', env: 'production' },
  environment = 'web',
  target = 'web',
}: {
  workspaceRoot: string;
  workspace: ResolvedContextWorkspace;
  configPath: string;
  producer?: 'rsbuild' | 'rslib';
  product?: 'application' | 'library';
  params?: Pick<ConfigParams, 'command' | 'env' | 'envMode'>;
  environment?: string;
  target?: string;
}): Promise<string> => {
  const runId = `run_${Math.random().toString(16).slice(2)}`;
  const plugin = createBuildContextPlugin({
    producer,
    product,
    capture: 'metadata',
    workspace,
    configPath,
    params: params as never,
    createRunId: () => runId,
    now: () => new Date('2026-08-12T08:00:00.000Z'),
  });
  const hooks = getObserverHooks(plugin);

  await hooks.beforeBuild?.({
    environments: {
      [environment]: {
        ...createEnvironment(environment, target),
      },
    },
  });

  const status = await readContextWorkspaceStatus(workspaceRoot);
  const run = status.runs.find((entry) => entry.run.runId === runId)?.run;
  expect(run).toBeDefined();
  return run!.contexts[0]!.contextId;
};

test('appends one observer without mutating user config or nested Rslib entries', () => {
  const existingPlugin = { name: 'existing' };
  const nestedPlugin = { name: 'nested' };
  const lib = [{ format: 'esm' }, { format: 'cjs' }];
  const config: {
    lib: typeof lib;
    plugins: RsbuildConfig['plugins'];
    source: { alias: { '@': string } };
  } = {
    lib,
    plugins: [false, [nestedPlugin, null], existingPlugin] as RsbuildConfig['plugins'],
    source: { alias: { '@': './src' } },
  };
  const originalConfigJson = JSON.stringify(config);
  const observer = { name: 'rstack:context' } as never;

  const appended = appendBuildContextPlugin(config, observer);

  expect(appended).not.toBe(config);
  expect(appended.plugins).not.toBe(config.plugins);
  expect(appended.plugins).toEqual([false, [nestedPlugin, null], existingPlugin, observer]);
  expect(config.plugins).toEqual([false, [nestedPlugin, null], existingPlugin]);
  expect(JSON.stringify(config)).toBe(originalConfigJson);
  expect(appended.lib).toBe(lib);
  expect(appended.lib).toEqual(lib);
});

test('publishes an aggregate manifest once and advances sequences per environment', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const plugin = createBuildContextPlugin({
      producer: 'rslib',
      product: 'library',
      capture: 'deep',
      workspace: {
        workspaceRoot,
        packageRoot: path.join(workspaceRoot, 'packages', 'library'),
        packageName: '@repo/library',
      },
      configPath: path.join(workspaceRoot, 'packages', 'library', 'rstack.config.ts'),
      params: { command: 'build', env: 'production' },
      createRunId: () => 'run_lifecycle',
      now: () => new Date('2026-08-12T08:30:00.000Z'),
    });
    const { hooks } = getObserverHarness(plugin);
    const esm = createEnvironment('esm', 'web');
    const cjs = createEnvironment('cjs', 'node');
    const environments = { cjs, esm };

    await hooks.beforeBuild?.({ environments });
    await hooks.beforeDevCompile?.({ environments });

    const esmStats = createStats({
      hash: 'esm-hash',
      hasWarnings: true,
      json: {
        assets: [{ name: 'dist/esm.js', size: 10 }],
        chunks: [{ files: ['dist/esm.js'], id: 'esm', initial: true }],
      },
    });
    await invokeAfter(hooks, {
      environment: esm,
      isFirstCompile: true,
      isWatch: true,
      stats: esmStats,
      time: 12,
    });
    await invokeAfter(hooks, {
      environment: esm,
      isFirstCompile: false,
      isWatch: true,
      stats: esmStats,
      time: 13,
    });
    await invokeAfter(hooks, {
      environment: cjs,
      isFirstCompile: true,
      isWatch: true,
      stats: createStats({ hasErrors: true }),
      time: 14,
    });

    const status = await readContextWorkspaceStatus(workspaceRoot);
    expect(status.runs).toHaveLength(1);
    expect(status.runs[0]!.run).toMatchObject({
      command: 'build',
      contexts: [
        { environment: 'cjs', product: 'library', target: 'node' },
        { environment: 'esm', product: 'library', target: 'web' },
      ],
      producer: 'rslib',
      runId: 'run_lifecycle',
    });

    const snapshots = new Map(
      status.runs[0]!.contexts.map(({ context, latestSnapshot }) => [
        context.environment,
        latestSnapshot,
      ]),
    );
    expect(snapshots.get('esm')).toMatchObject({
      sequence: 2,
      status: 'pass',
      completeness: { build: 'complete', deep: 'unsupported' },
      facets: {
        build: {
          producer: 'rslib',
          command: 'build',
          mode: 'production',
          environment: 'esm',
          target: ['web'],
          isWatch: true,
          isFirstCompile: false,
          durationMs: 13,
          hash: 'esm-hash',
          hasErrors: false,
          hasWarnings: true,
          assets: [{ name: 'dist/esm.js', size: 10 }],
          chunks: [{ id: 'esm', files: ['dist/esm.js'], initial: true }],
          truncated: { assets: 0, chunks: 0 },
        },
      },
    });
    expect(snapshots.get('cjs')).toMatchObject({
      sequence: 1,
      status: 'fail',
      completeness: { build: 'complete', deep: 'unsupported' },
    });
    expect(esmStats.calls).toEqual([
      {
        all: false,
        hash: true,
        timings: true,
        assets: true,
        chunks: true,
        errors: false,
        warnings: false,
      },
      {
        all: false,
        hash: true,
        timings: true,
        assets: true,
        chunks: true,
        errors: false,
        warnings: false,
      },
    ]);
  });
});

test('bounds metadata paths and distinguishes disabled deep capture from partial builds', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const plugin = createBuildContextPlugin({
      producer: 'rsbuild',
      product: 'application',
      capture: 'metadata',
      workspace: {
        workspaceRoot,
        packageRoot: path.join(workspaceRoot, 'apps', 'web'),
      },
      params: { command: 'dev', env: 'development' },
      createRunId: () => 'run_bounds',
      now: () => new Date('2026-08-12T08:45:00.000Z'),
    });
    const { hooks } = getObserverHarness(plugin);
    const environment = createEnvironment('web', 'web');
    await hooks.beforeDevCompile?.({ environments: { web: environment } });

    await invokeAfter(hooks, {
      environment,
      isFirstCompile: true,
      isWatch: true,
      stats: createStats({
        json: {
          assets: Array.from({ length: 101 }, (_, index) => ({
            name: path.join(workspaceRoot, 'dist', `asset-${index}.js`),
            size: index,
          })),
          chunks: Array.from({ length: 101 }, (_, index) => ({
            files: Array.from({ length: 21 }, (_, fileIndex) =>
              path.join(workspaceRoot, 'dist', `chunk-${index}-${fileIndex}.js`),
            ),
            id: `${index}`,
          })),
        },
      }),
      time: 20,
    });

    const cappedSnapshot = (await readContextWorkspaceStatus(workspaceRoot)).runs[0]!.contexts[0]!
      .latestSnapshot!;
    const build = cappedSnapshot.facets.build as {
      assets: Array<{ name: string; size: number }>;
      chunks: Array<{ files: string[] }>;
      truncated: { assets: number; chunks: number };
    };
    expect(build.assets).toHaveLength(100);
    expect(build.assets[0]).toEqual({ name: 'dist/asset-0.js', size: 0 });
    expect(build.chunks).toHaveLength(100);
    expect(build.chunks[0]!.files).toHaveLength(20);
    expect(build.chunks[0]!.files[0]).toBe('dist/chunk-0-0.js');
    expect(build.truncated).toEqual({ assets: 1, chunks: 1 });
    expect(JSON.stringify(cappedSnapshot)).not.toContain(workspaceRoot);

    await invokeAfter(hooks, {
      environment,
      isFirstCompile: false,
      isWatch: true,
      time: 21,
    });

    const snapshot = (await readContextWorkspaceStatus(workspaceRoot)).runs[0]!.contexts[0]!
      .latestSnapshot!;
    expect(snapshot).toMatchObject({
      sequence: 2,
      status: 'error',
      completeness: { build: 'partial', deep: 'disabled' },
    });
  });
});

test('keeps capture failures out of build hooks and warns once per observer', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const plugin = createBuildContextPlugin({
      producer: 'rsbuild',
      product: 'application',
      capture: 'metadata',
      workspace: {
        workspaceRoot,
        packageRoot: path.join(workspaceRoot, 'app'),
      },
      params: { command: 'build', env: 'production' },
      createRunId: () => 'run_failure',
    });
    const harness = getObserverHarness(plugin);
    const environment = createEnvironment('web', 'web');
    const brokenStats = {
      hasErrors: () => false,
      hasWarnings: () => false,
      toJson: () => {
        throw new Error('broken stats');
      },
    };

    await harness.hooks.beforeBuild?.({ environments: { web: environment } });
    await expect(
      invokeAfter(harness.hooks, {
        environment,
        isFirstCompile: true,
        isWatch: false,
        stats: brokenStats,
        time: 1,
      }),
    ).resolves.toBeUndefined();
    await expect(
      invokeAfter(harness.hooks, {
        environment,
        isFirstCompile: false,
        isWatch: false,
        stats: brokenStats,
        time: 1,
      }),
    ).resolves.toBeUndefined();
    expect(harness.warnings).toEqual(['Failed to capture Rstack build context.']);
  });
});

test('treats a resolved manifest-store failure as a fail-soft capture failure', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const plugin = createBuildContextPlugin({
      producer: 'rsbuild',
      product: 'application',
      capture: 'metadata',
      workspace: { workspaceRoot, packageRoot: path.join(workspaceRoot, 'app') },
      params: { command: 'build', env: 'production' },
      createRunId: () => 'run/invalid',
    });
    const harness = getObserverHarness(plugin);
    const environments = { web: createEnvironment('web', 'web') };

    await expect(harness.hooks.beforeBuild?.({ environments })).resolves.toBeUndefined();
    await expect(harness.hooks.beforeDevCompile?.({ environments })).resolves.toBeUndefined();
    expect(harness.warnings).toEqual(['Failed to capture Rstack build context.']);
    expect(await readContextWorkspaceStatus(workspaceRoot)).toMatchObject({ runs: [] });
  });
});

test('treats a resolved snapshot-store failure as a fail-soft capture failure', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const plugin = createBuildContextPlugin({
      producer: 'rsbuild',
      product: 'application',
      capture: 'metadata',
      workspace: { workspaceRoot, packageRoot: path.join(workspaceRoot, 'app') },
      params: { command: 'build', env: 'production' },
      createRunId: () => 'run_snapshot_failure',
    });
    const harness = getObserverHarness(plugin);
    const environment = createEnvironment('web', 'web');
    const longAssetName = `dist/${'a'.repeat(12_000)}.js`;

    await harness.hooks.beforeBuild?.({ environments: { web: environment } });
    await expect(
      invokeAfter(harness.hooks, {
        environment,
        isFirstCompile: true,
        isWatch: false,
        stats: createStats({
          json: {
            assets: Array.from({ length: 100 }, () => ({ name: longAssetName, size: 1 })),
          },
        }),
        time: 1,
      }),
    ).resolves.toBeUndefined();
    expect(harness.warnings).toEqual(['Failed to capture Rstack build context.']);
    expect(
      (await readContextWorkspaceStatus(workspaceRoot)).runs[0]!.contexts[0]!.latestSnapshot,
    ).toBeUndefined();
  });
});

test('serializes Stats before awaiting manifest publication', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const plugin = createBuildContextPlugin({
      producer: 'rsbuild',
      product: 'application',
      capture: 'metadata',
      workspace: { workspaceRoot, packageRoot: path.join(workspaceRoot, 'app') },
      params: { command: 'build', env: 'production' },
      createRunId: () => 'run_synchronous_stats',
    });
    const { hooks } = getObserverHarness(plugin);
    const environment = createEnvironment('web', 'web');
    const stats = createStats({ json: { assets: [] } });

    const before = hooks.beforeBuild!({ environments: { web: environment } });
    const after = hooks.afterEnvironmentCompile!({
      environment,
      isFirstCompile: true,
      isWatch: false,
      stats,
      time: 1,
    });

    const synchronousCallCount = stats.calls.length;
    await before;
    await after;
    expect(synchronousCallCount).toBe(1);
  });
});

test('normalizes metadata paths and excludes checkout-escaping paths', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const plugin = createBuildContextPlugin({
      producer: 'rsbuild',
      product: 'application',
      capture: 'metadata',
      workspace: { workspaceRoot, packageRoot: path.join(workspaceRoot, 'app') },
      params: { command: 'build', env: 'production' },
      createRunId: () => 'run_metadata_paths',
    });
    const { hooks } = getObserverHarness(plugin);
    const environment = createEnvironment('web', 'web');

    await hooks.beforeBuild?.({ environments: { web: environment } });
    await invokeAfter(hooks, {
      environment,
      isFirstCompile: true,
      isWatch: false,
      stats: createStats({
        json: {
          assets: [
            { name: 'dist/./asset.js', size: 1 },
            { name: 'dist//repeated.js', size: 2 },
            { name: 'dist/../../outside.js', size: 3 },
          ],
          chunks: [
            {
              files: ['dist/./chunk.js', 'dist//repeated.js', 'dist/../../outside.js'],
              id: 'web',
            },
          ],
        },
      }),
      time: 1,
    });

    const build = (await readContextWorkspaceStatus(workspaceRoot)).runs[0]!.contexts[0]!
      .latestSnapshot!.facets.build as {
      assets: Array<{ name: string; size: number }>;
      chunks: Array<{ files: string[] }>;
    };
    expect(build.assets).toEqual([
      { name: 'dist/asset.js', size: 1 },
      { name: 'dist/repeated.js', size: 2 },
    ]);
    expect(build.chunks).toEqual([{ files: ['dist/chunk.js', 'dist/repeated.js'], id: 'web' }]);
  });
});

test('does not let a throwing logger escape the capture guard', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const plugin = createBuildContextPlugin({
      producer: 'rsbuild',
      product: 'application',
      capture: 'metadata',
      workspace: {
        workspaceRoot,
        packageRoot: path.join(workspaceRoot, '..', 'outside-package'),
      },
      params: { command: 'build', env: 'production' },
    });
    const harness = getObserverHarness(plugin, { throwOnWarning: true });

    await expect(
      harness.hooks.beforeBuild?.({
        environments: { web: createEnvironment('web', 'web') },
      }),
    ).resolves.toBeUndefined();
    expect(harness.warnings).toEqual(['Failed to capture Rstack build context.']);
  });
});

test('rejects escaping package and config paths before publishing a manifest', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const plugin = createBuildContextPlugin({
      producer: 'rsbuild',
      product: 'application',
      capture: 'metadata',
      workspace: {
        workspaceRoot,
        packageRoot: path.join(workspaceRoot, '..', 'outside-package'),
      },
      configPath: path.join(workspaceRoot, '..', 'outside.config.ts'),
      params: { command: 'build', env: 'production' },
    });
    const harness = getObserverHarness(plugin);

    await expect(
      harness.hooks.beforeBuild?.({
        environments: { web: createEnvironment('web', 'web') },
      }),
    ).resolves.toBeUndefined();
    expect(await readContextWorkspaceStatus(workspaceRoot)).toMatchObject({
      runs: [],
    });
    expect(harness.warnings).toEqual(['Failed to capture Rstack build context.']);
  });
});

test('derives stable IDs from normalized identity inputs and separates every identity field', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const workspace = {
      workspaceRoot,
      packageRoot: path.join(workspaceRoot, 'packages', 'app'),
      packageName: '@repo/app',
    };
    const configPath = path.join(workspaceRoot, 'packages', 'app', 'rstack.config.ts');
    const base = {
      workspaceRoot,
      workspace,
      configPath,
    };

    const stable = await collectContextId(base);
    expect(stable).toMatch(/^ctx_[a-f0-9]{24}$/u);
    expect(await collectContextId(base)).toBe(stable);
    await expect(
      collectContextId({
        ...base,
        workspace: { ...workspace, packageRoot: `${workspace.packageRoot}/./` },
        configPath: `${path.dirname(configPath)}/../app/rstack.config.ts`,
      }),
    ).resolves.toBe(stable);

    await expect(collectContextId({ ...base, environment: 'node' })).resolves.not.toBe(stable);
    await expect(
      collectContextId({
        ...base,
        workspace: {
          ...workspace,
          packageRoot: path.join(workspaceRoot, 'packages', 'other'),
        },
      }),
    ).resolves.not.toBe(stable);
    await expect(
      collectContextId({
        ...base,
        configPath: path.join(workspaceRoot, 'other.config.ts'),
      }),
    ).resolves.not.toBe(stable);
    await expect(
      collectContextId({ ...base, product: 'library', producer: 'rsbuild' }),
    ).resolves.not.toBe(stable);
    await expect(
      collectContextId({ ...base, product: 'application', producer: 'rslib' }),
    ).resolves.not.toBe(stable);
    await expect(
      collectContextId({
        ...base,
        params: { command: 'dev', env: 'production' },
      }),
    ).resolves.not.toBe(stable);
    await expect(
      collectContextId({
        ...base,
        params: { command: 'build', env: 'development' },
      }),
    ).resolves.not.toBe(stable);
    await expect(collectContextId({ ...base, target: 'node' })).resolves.not.toBe(stable);
  });
});
