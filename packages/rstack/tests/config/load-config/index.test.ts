import path from 'node:path';
import { afterEach, expect, test } from 'rstack/test';
import { getConfigState, loadRstackConfig } from '../../../src/config.ts';

const state = getConfigState();

afterEach(() => {
  state.configs = {};
  delete state.configPath;
});

test('should reset config state before and after loading', async () => {
  state.configs = { app: {} };
  state.configPath = path.join(import.meta.dirname, 'rstack.config.ts');

  await expect(loadRstackConfig()).rejects.toThrow('test config error');
  expect(state.configs).toEqual({});
});

test('should prefer an explicit config path over the state config path', async () => {
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
