import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { createContextPlugin } from '../../src/contextPlugin.ts';
import type { LoadedRstackConfig } from '../../src/config.ts';
import type { RstackPlugin } from '../../src/plugin.ts';
import { createPluginRuntime } from '../../src/pluginRuntime.ts';

const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  success() {},
};

const createLoadedConfig = (
  context: LoadedRstackConfig['configs']['context'],
): LoadedRstackConfig => ({
  configs: { context },
  plugins: [],
  filePath: null,
  dependencies: [],
});

const withWorkspace = async (callback: (workspaceRoot: string) => Promise<void>): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-plugin-host-'));
  try {
    await writeFile(
      path.join(workspaceRoot, 'package.json'),
      JSON.stringify({ name: 'context-host-fixture', private: true }),
    );
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

const createRuntime = async (
  workspaceRoot: string,
  context: LoadedRstackConfig['configs']['context'],
  userPlugin?: RstackPlugin,
) =>
  createPluginRuntime({
    plugins: [userPlugin, createContextPlugin(createLoadedConfig(context), workspaceRoot)],
    context: {
      cwd: workspaceRoot,
      command: 'build',
      args: [],
      configFilePath: null,
    },
    logger,
  });

test('registers no build modifiers when built-in Context capture is off', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const runtime = await createRuntime(workspaceRoot, { capture: 'off' });

    expect(runtime.hasConfigModifier('app')).toBe(false);
    expect(runtime.hasConfigModifier('lib')).toBe(false);
  });
});

test('runs user modifiers before independent app and lib Context observers', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const runtime = await createRuntime(
      workspaceRoot,
      { enabled: true },
      {
        name: 'user',
        setup({ modifyConfig }) {
          modifyConfig('app', (config) => ({
            ...config,
            plugins: [...(config.plugins ?? []), { name: 'user-app', setup() {} }],
          }));
          modifyConfig('lib', (config) => ({
            ...config,
            plugins: [...(config.plugins ?? []), { name: 'user-lib', setup() {} }],
          }));
        },
      },
    );
    const params = { command: 'build', env: 'production', envMode: 'production' } as never;

    expect(runtime.hasConfigModifier('app')).toBe(true);
    expect(runtime.hasConfigModifier('lib')).toBe(true);

    const base = { plugins: [{ name: 'base', setup() {} }] };
    const app = await runtime.applyConfigModifiers('app', base, { params });
    const lib = await runtime.applyConfigModifiers('lib', base, { params });
    const appAgain = await runtime.applyConfigModifiers('app', base, { params });

    expect(app.plugins?.map((plugin) => plugin && 'name' in plugin && plugin.name)).toEqual([
      'base',
      'user-app',
      'rstack:context-build',
    ]);
    expect(lib.plugins?.map((plugin) => plugin && 'name' in plugin && plugin.name)).toEqual([
      'base',
      'user-lib',
      'rstack:context-build',
    ]);
    expect(appAgain.plugins).toHaveLength(3);
    expect(base.plugins).toHaveLength(1);
  });
});
