import type { RsbuildConfigDefinition, ConfigParams } from '@rsbuild/core';
import { loadRstackConfig, type Configs } from './config.js';

const resolveRsbuildConfig = async (configs: Configs, params: ConfigParams) => {
  const appConfig = configs.app;
  if (!appConfig) {
    return {};
  }
  if (typeof appConfig === 'function') {
    return appConfig(params);
  }
  return appConfig;
};

const loadRsbuildConfig: RsbuildConfigDefinition = async (params) => {
  const configs = await loadRstackConfig();
  return resolveRsbuildConfig(configs, params);
};

export default loadRsbuildConfig;
