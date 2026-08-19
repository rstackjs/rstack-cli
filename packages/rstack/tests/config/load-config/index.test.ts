import path from 'node:path';
import { afterEach, expect, test } from 'rstack/test';
import {
  define,
  getConfigState,
  loadRstackConfig,
} from '../../../src/config.ts';

type Deferred = ReturnType<typeof Promise.withResolvers<void>>;

type ConfigTestHooks = {
  ready: Deferred;
  release: Deferred;
};

declare global {
  // rslint-disable-next-line no-var
  var __rstackConfigTestHooks: ConfigTestHooks | undefined;
}

const state = getConfigState();
const configPath = (fileName: string): string =>
  path.join(import.meta.dirname, fileName);
const loadConfigFile = (fileName: string) =>
  loadRstackConfig({ configFilePath: configPath(fileName) });

const createTestHooks = (): ConfigTestHooks =>
  (globalThis.__rstackConfigTestHooks = {
    ready: Promise.withResolvers<void>(),
    release: Promise.withResolvers<void>(),
  });

afterEach(() => {
  delete state.configPath;
  delete globalThis.__rstackConfigTestHooks;
});

test('should discard a config session after loading fails', async () => {
  state.configPath = configPath('rstack.config.ts');

  await expect(loadRstackConfig()).rejects.toThrow('test config error');

  const { configs, plugins } = await loadConfigFile('explicit.config.ts');
  expect(configs).toEqual({ app: {} });
  expect(plugins).toEqual([]);
});

test('should prefer an explicit config path over the state config path', async () => {
  const explicitConfigPath = configPath('explicit.config.ts');
  state.configPath = configPath('rstack.config.ts');

  const { configs, filePath } = await loadRstackConfig({
    configFilePath: explicitConfigPath,
  });

  expect(configs.app).toEqual({});
  expect(filePath).toBe(explicitConfigPath);
});

test('should resolve a relative explicit config path from cwd', async () => {
  const { configs, filePath } = await loadRstackConfig({
    configFilePath: 'explicit.config.ts',
    cwd: import.meta.dirname,
  });

  expect(configs.app).toEqual({});
  expect(filePath).toBe(configPath('explicit.config.ts'));
});

test('should search for the config file in cwd', async () => {
  await expect(loadRstackConfig({ cwd: import.meta.dirname })).rejects.toThrow(
    'test config error',
  );
});

test('should isolate parallel config sessions across top-level await', async () => {
  const hooks = createTestHooks();
  const firstLoad = loadConfigFile('parallel-first.config.ts');
  await hooks.ready.promise;

  const secondLoad = loadConfigFile('parallel-second.config.ts');
  const parallelLoads = Promise.all([firstLoad, secondLoad]);

  await secondLoad;
  hooks.release.resolve();
  const [firstResult, secondResult] = await parallelLoads;

  expect(firstResult.configs).toEqual({
    app: { root: 'first' },
    test: {},
  });
  expect(firstResult.plugins).toMatchObject([{ name: 'first' }]);
  expect(secondResult.configs).toEqual({
    app: { root: 'second' },
    lib: {},
  });
  expect(secondResult.plugins).toMatchObject([{ name: 'second' }]);
});

test('should keep a running session intact when another config fails', async () => {
  const hooks = createTestHooks();
  const successfulLoad = loadConfigFile('parallel-first.config.ts');
  await hooks.ready.promise;

  await expect(loadConfigFile('parallel-failing.config.ts')).rejects.toThrow(
    'parallel config error',
  );
  hooks.release.resolve();

  expect((await successfulLoad).configs).toEqual({
    app: { root: 'first' },
    test: {},
  });
});

test('should reject duplicate definitions within the same session', async () => {
  await expect(loadConfigFile('duplicate.config.ts')).rejects.toThrow(
    'The "app" config has already been defined.',
  );
});

test('should capture nested and asynchronous plugin definitions', async () => {
  const { plugins } = await loadConfigFile('plugins.config.ts');

  expect(plugins).toHaveLength(3);
  expect(plugins[0]).toMatchObject({ name: 'first' });
  await expect(plugins[1]).resolves.toMatchObject({ name: 'second' });
  await expect(plugins[2]).resolves.toEqual([
    false,
    expect.objectContaining({ name: 'third' }),
  ]);
});

test('should reject duplicate plugin definitions within the same session', async () => {
  await expect(loadConfigFile('duplicate-plugins.config.ts')).rejects.toThrow(
    'The "plugins" config has already been defined.',
  );
});

test('should reject plugin definitions outside config loading', () => {
  expect(() => define.plugins([])).toThrow(
    'The "plugins" config must be defined while loading an Rstack config.',
  );
});
