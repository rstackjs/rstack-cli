import { loadConfig, type RsbuildConfigDefinition, type ConfigParams } from '@rsbuild/core';
import { getConfig, clearConfig } from './define.js';
import { configFileNames } from './constants.js';

const resolveRsbuildConfig = async (params: ConfigParams) => {
  const appConfig = getConfig('app');
  if (!appConfig) {
    return {};
  }
  if (typeof appConfig === 'function') {
    return appConfig(params);
  }
  return appConfig;
};

const loadRsbuildConfig: RsbuildConfigDefinition = async (params) => {
  await loadConfig({
    loader: 'native',
    configFileNames,
  });

  const appConfig = await resolveRsbuildConfig(params);
  clearConfig();
  return appConfig;
};

export default loadRsbuildConfig;
