import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RsbuildConfig } from '@rsbuild/core';
import type { RslibConfig } from '@rslib/core';
import { readContextWorkspaceStatus, readProjectStatus } from '@rstackjs/context';
import { afterEach, expect, test } from 'rstack/test';
import { getConfigState } from '../../src/config.ts';
import defaultLoadRsbuildConfig, {
  loadRsbuildConfig,
  resolveRsbuildConfig,
} from '../../src/rsbuildConfig.ts';
import defaultLoadRslibConfig, {
  loadRslibConfig,
  resolveRslibConfig,
} from '../../src/rslibConfig.ts';

type ConfigKind = 'app' | 'lib';
type ConfigDefinition = 'object' | 'async';

type InjectionTestHooks = {
  config: {
    dev?: { watchFiles?: unknown };
    lib?: Array<{ format: string }>;
    plugins: Array<unknown>;
  };
  params?: unknown;
};

declare global {
  // rslint-disable-next-line no-var
  var __rstackInjectionTestHooks: InjectionTestHooks | undefined;
}

const state = getConfigState();
const configModuleUrl = pathToFileURL(
  path.resolve(import.meta.dirname, '../../src/config.ts'),
).href;
const params = {
  command: 'build',
  env: 'development',
  envMode: 'injection-test',
} as never;

const withConfig = async (
  {
    kind,
    definition,
    contextEnabled,
    symlinked = false,
  }: {
    kind: ConfigKind;
    definition: ConfigDefinition;
    contextEnabled: boolean;
    symlinked?: boolean;
  },
  callback: (fixture: {
    configPath: string;
    getHooks: () => InjectionTestHooks;
    workspaceRoot: string;
  }) => Promise<void>,
): Promise<void> => {
  const fixtureRoot = await realpath(
    await mkdtemp(path.join(os.tmpdir(), 'rstack-context-injection-')),
  );
  const workspaceRoot = symlinked ? path.join(fixtureRoot, 'checkout') : fixtureRoot;
  await mkdir(workspaceRoot, { recursive: true });
  const configPath = path.join(workspaceRoot, 'rstack.config.ts');
  const configDefinition =
    definition === 'async'
      ? `async (params) => {
  globalThis.__rstackInjectionTestHooks.params = params;
  return config;
}`
      : 'config';

  await writeFile(
    path.join(workspaceRoot, 'package.json'),
    JSON.stringify({
      name: '@rstack/injection-fixture',
      private: true,
      type: 'module',
    }),
  );
  await writeFile(path.join(workspaceRoot, 'pnpm-workspace.yaml'), 'packages: []\n');
  await writeFile(
    path.join(workspaceRoot, 'context-label.ts'),
    "export const variant = 'firefox_v3';\n",
  );
  await writeFile(
    configPath,
    `import { define } from ${JSON.stringify(configModuleUrl)};
import { variant } from './context-label.ts';

const config = {
  plugins: [{ name: 'user-first' }, false, [{ name: 'user-last' }]],
  dev: { watchFiles: 'user-watch.ts' },
  lib: [{ format: 'esm' }, { format: 'cjs' }],
};

globalThis.__rstackInjectionTestHooks = { config };
define.context({ enabled: ${contextEnabled}, variant });
define.${kind}(${configDefinition});
`,
  );
  const loadedConfigPath = symlinked
    ? path.join(fixtureRoot, 'linked-rstack.config.ts')
    : configPath;
  if (symlinked) {
    await symlink(configPath, loadedConfigPath);
  }
  state.configPath = loadedConfigPath;

  try {
    await callback({
      configPath: loadedConfigPath,
      getHooks: () => globalThis.__rstackInjectionTestHooks!,
      workspaceRoot,
    });
  } finally {
    await rm(fixtureRoot, { force: true, recursive: true });
  }
};

const getObserver = (config: { plugins?: Array<unknown> }) => {
  const observer = config.plugins?.at(-1) as
    | {
        name?: string;
        setup?: (api: unknown) => void;
      }
    | undefined;

  expect(observer?.name).toBe('rstack:context-build');
  return observer!;
};

const observeBuild = async (config: { plugins?: Array<unknown> }, workspaceRoot: string) => {
  let beforeBuild:
    ((context: { environments: Record<string, unknown> }) => Promise<void> | void) | undefined;
  const observer = getObserver(config);

  observer.setup?.({
    logger: { warn: () => {} },
    onAfterEnvironmentCompile: () => {},
    onBeforeBuild: (callback: typeof beforeBuild) => {
      beforeBuild = callback;
    },
    onBeforeDevCompile: () => {},
  });

  expect(beforeBuild).toBeDefined();
  await beforeBuild!({
    environments: {
      web: {
        config: { output: { target: 'web' } },
        distPath: path.join(workspaceRoot, 'dist'),
        name: 'web',
      },
    },
  });

  return readContextWorkspaceStatus(workspaceRoot);
};

const observeCompletedBuild = async (
  config: { plugins?: Array<unknown> },
  workspaceRoot: string,
) => {
  let afterEnvironmentCompile:
    | ((context: {
        environment: unknown;
        isFirstCompile: boolean;
        isWatch: boolean;
        stats: unknown;
        time: number;
      }) => Promise<void> | void)
    | undefined;
  const observer = getObserver(config);

  observer.setup?.({
    logger: { warn: () => {} },
    onAfterEnvironmentCompile: (callback: typeof afterEnvironmentCompile) => {
      afterEnvironmentCompile = callback;
    },
    onBeforeBuild: () => {},
    onBeforeDevCompile: () => {},
  });

  expect(afterEnvironmentCompile).toBeDefined();
  await afterEnvironmentCompile!({
    environment: {
      config: { output: { target: 'web' } },
      distPath: path.join(workspaceRoot, 'dist'),
      name: 'web',
    },
    isFirstCompile: true,
    isWatch: false,
    stats: {
      hasErrors: () => false,
      hasWarnings: () => false,
      toJson: () => ({}),
    },
    time: 1,
  });

  return readProjectStatus(workspaceRoot);
};

afterEach(() => {
  delete state.configPath;
  delete process.env.RSTACK_CONTEXT;
  delete globalThis.__rstackInjectionTestHooks;
});

for (const { kind, definition, producer, product } of [
  {
    kind: 'app',
    definition: 'object',
    producer: 'rsbuild',
    product: 'application',
  },
  {
    kind: 'app',
    definition: 'async',
    producer: 'rsbuild',
    product: 'application',
  },
  { kind: 'lib', definition: 'object', producer: 'rslib', product: 'library' },
  { kind: 'lib', definition: 'async', producer: 'rslib', product: 'library' },
] as const) {
  test(`injects one trailing observer for enabled ${definition} ${kind} configs`, async () => {
    await withConfig({ kind, definition, contextEnabled: true }, async (fixture) => {
      const config =
        kind === 'app' ? await loadRsbuildConfig(params) : await loadRslibConfig(params);
      const result = config as {
        dev?: { watchFiles?: unknown };
        lib?: unknown;
        plugins?: Array<unknown>;
      };

      const hooks = fixture.getHooks();

      expect(result).not.toBe(hooks.config);
      expect(result.plugins).not.toBe(hooks.config.plugins);
      expect(result.plugins).toHaveLength(4);
      expect(result.plugins?.slice(0, -1)).toEqual(hooks.config.plugins);
      expect(hooks.config.plugins).toEqual([
        { name: 'user-first' },
        false,
        [{ name: 'user-last' }],
      ]);
      expect(hooks.params).toBe(definition === 'async' ? params : undefined);

      if (kind === 'app') {
        const watchFiles = result.dev?.watchFiles as Array<{
          paths?: string[];
        }>;
        expect(watchFiles[0]).toBe('user-watch.ts');
        expect(watchFiles.at(-1)).toMatchObject({
          paths: [fixture.configPath, path.join(fixture.workspaceRoot, 'context-label.ts')],
          type: 'reload-server',
        });
      } else {
        expect(result.lib).toBe(hooks.config.lib);
        expect(result.lib).toEqual([{ format: 'esm' }, { format: 'cjs' }]);
      }

      const status = await observeBuild(result, fixture.workspaceRoot);
      expect(status.runs).toHaveLength(1);
      expect(status.runs[0].run).toMatchObject({
        command: 'build',
        producer,
        contexts: [
          {
            configPath: 'rstack.config.ts',
            variant: 'firefox_v3',
            mode: 'injection-test',
            packageName: '@rstack/injection-fixture',
            packageRoot: '.',
            product,
          },
        ],
      });
      const snapshotStatus = await observeCompletedBuild(result, fixture.workspaceRoot);
      expect(snapshotStatus.contexts[0].freshness).toEqual({
        state: 'partial',
        changedPaths: [],
      });
      await writeFile(
        path.join(fixture.workspaceRoot, 'context-label.ts'),
        `${await readFile(path.join(fixture.workspaceRoot, 'context-label.ts'), 'utf8')}\n`,
      );
      expect((await readProjectStatus(fixture.workspaceRoot)).contexts[0].freshness).toEqual({
        state: 'stale',
        changedPaths: ['context-label.ts'],
      });
    });
  });
}

for (const { kind, producer, product } of [
  { kind: 'app', producer: 'rsbuild', product: 'application' },
  { kind: 'lib', producer: 'rslib', product: 'library' },
] as const) {
  test(`canonicalizes a symlinked loaded config path for ${kind} capture`, async () => {
    await withConfig(
      { kind, definition: 'object', contextEnabled: true, symlinked: true },
      async (fixture) => {
        const config =
          kind === 'app' ? await loadRsbuildConfig(params) : await loadRslibConfig(params);

        const status = await observeBuild(config, fixture.workspaceRoot);
        expect(status.runs).toHaveLength(1);
        expect(status.runs[0].run).toMatchObject({
          producer,
          contexts: [
            {
              configPath: 'rstack.config.ts',
              packageRoot: '.',
              product,
            },
          ],
        });
      },
    );
  });
}

test('keeps the resolved library config unchanged when context is disabled', async () => {
  await withConfig(
    { kind: 'lib', definition: 'object', contextEnabled: false },
    async (fixture) => {
      const config = await loadRslibConfig(params);

      const hooks = fixture.getHooks();

      expect(config).toBe(hooks.config);
      expect(config.plugins?.map((plugin) => (plugin as { name?: string })?.name)).not.toContain(
        'rstack:context-build',
      );
      expect(config.lib).toBe(hooks.config.lib);
    },
  );
});

test('RSTACK_CONTEXT=0 prevents app observer injection while preserving config watches', async () => {
  process.env.RSTACK_CONTEXT = '0';

  await withConfig({ kind: 'app', definition: 'object', contextEnabled: true }, async (fixture) => {
    const config = await loadRsbuildConfig(params);
    const watchFiles = config.dev?.watchFiles as Array<{ paths?: string[] }>;

    expect(config.plugins?.map((plugin) => (plugin as { name?: string })?.name)).not.toContain(
      'rstack:context-build',
    );
    expect(watchFiles[0]).toBe('user-watch.ts');
    expect(watchFiles.at(-1)).toMatchObject({
      paths: [fixture.configPath, path.join(fixture.workspaceRoot, 'context-label.ts')],
    });
  });
});

test('pure config resolvers never inject context observers', async () => {
  const appPlugin = { name: 'app-user' } as never;
  const libPlugin = { name: 'lib-user' } as never;
  const app = { plugins: [appPlugin] } as RsbuildConfig;
  const lib = { lib: [{ format: 'esm' }], plugins: [libPlugin] } as RslibConfig;

  expect(await resolveRsbuildConfig({ app, context: { enabled: true } }, params)).toBe(app);
  expect(await resolveRslibConfig({ lib, context: { enabled: true } }, params)).toBe(lib);
  expect(app.plugins).toEqual([appPlugin]);
  expect(lib.plugins).toEqual([libPlugin]);
  expect(defaultLoadRsbuildConfig).toBe(loadRsbuildConfig);
  expect(defaultLoadRslibConfig).toBe(loadRslibConfig);
});
