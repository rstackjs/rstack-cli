import path from 'node:path';
import type { RsbuildConfigAsyncFn, WatchFiles } from '@rsbuild/core';
import { expect, test } from 'rstack/test';
import { getConfigState } from '../../../src/config.ts';
import loadRsbuildConfig from '../../../src/rsbuildConfig.ts';

test('should not mutate reusable app config when adding config watchers', async () => {
  const state = getConfigState();
  const previousConfigPath = state.configPath;
  const userWatchFiles: WatchFiles[] = [];
  const appConfig = {
    dev: {
      watchFiles: userWatchFiles,
    },
  };

  globalThis.__rstackReusableAppConfig = appConfig;
  state.configPath = path.join(import.meta.dirname, 'rstack.config.ts');

  try {
    const loadConfig = loadRsbuildConfig as RsbuildConfigAsyncFn;
    const params = { command: 'dev', env: 'development' };
    const firstConfig = await loadConfig(params);
    const secondConfig = await loadConfig(params);

    expect(firstConfig).not.toBe(appConfig);
    expect(firstConfig.dev).not.toBe(appConfig.dev);
    expect(firstConfig.dev?.watchFiles).toHaveLength(1);
    expect(secondConfig.dev?.watchFiles).toHaveLength(1);
    expect(userWatchFiles).toEqual([]);
  } finally {
    globalThis.__rstackReusableAppConfig = undefined;
    state.configs = {};
    if (previousConfigPath === undefined) {
      delete state.configPath;
    } else {
      state.configPath = previousConfigPath;
    }
  }
});
