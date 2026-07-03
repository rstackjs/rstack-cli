import type { RsbuildConfigDefinition, ConfigParams } from '@rsbuild/core';
import { getConfig, clearConfig, loadRstackConfig } from './config.js';

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
  await loadRstackConfig();
  const appConfig = await resolveRsbuildConfig(params);
  clearConfig();
  return appConfig;
};

export default loadRsbuildConfig;
