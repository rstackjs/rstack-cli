import path from 'node:path';
import { afterEach, expect, test } from 'rstack/test';
import { getConfigState, loadRstackConfig } from '../../../src/config.ts';

const state = getConfigState();

afterEach(() => {
  state.configs = {};
  delete state.configPath;
  delete globalThis.__rstackLoadConfigFreshCount;
});

test('should reset config state before and after loading', async () => {
  state.configs = { app: {} };
  state.configPath = path.join(import.meta.dirname, 'rstack.config.ts');

  await expect(loadRstackConfig()).rejects.toThrow('test config error');
  expect(state.configs).toEqual({});
});

test('should load an explicit config path before the legacy state path', async () => {
  const configFilePath = path.join(import.meta.dirname, 'explicit.config.ts');
  const dependencyPath = path.join(import.meta.dirname, 'explicit-dependency.ts');
  const relativeConfigPath = path.relative(process.cwd(), configFilePath);
  state.configPath = path.join(import.meta.dirname, 'rstack.config.ts');

  const loaded = await loadRstackConfig({
    configFilePath: relativeConfigPath,
  });

  expect(loaded.configs.app).toEqual({
    html: {
      title: 'explicit config works',
    },
  });
  expect(loaded.filePath).toBe(configFilePath);
  expect(loaded.dependencies).toEqual([dependencyPath]);
  expect(state.configs).toEqual({});
});

test('should report the resolved path when an explicit config is missing', async () => {
  const configFilePath = path.join(import.meta.dirname, 'missing.config.ts');
  state.configs = { app: {} };

  await expect(loadRstackConfig({ configFilePath })).rejects.toThrow(
    `Cannot find config file: ${configFilePath}`,
  );
  expect(state.configs).toEqual({});
});

test('should forward the fresh option to the config loader', async () => {
  const configFilePath = path.join(import.meta.dirname, 'fresh.config.ts');

  const cached = await loadRstackConfig({
    configFilePath,
    fresh: false,
  });
  const fresh = await loadRstackConfig({
    configFilePath,
    fresh: true,
  });

  expect(cached.configs.app).toEqual({
    source: {
      define: {
        RSTACK_LOAD_COUNT: '1',
      },
    },
  });
  expect(fresh.configs.app).toEqual({
    source: {
      define: {
        RSTACK_LOAD_COUNT: '2',
      },
    },
  });
});
