import type { ConfigParams, RsbuildConfigDefinition } from '@rsbuild/core';
import { withConfigMeta } from '@rstackjs/load-config';
import { loadRstackConfig, type Configs } from './config.ts';

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
  const { configs, filePath, dependencies } = await loadRstackConfig();
  const config = await resolveRsbuildConfig(configs, params);

  return withConfigMeta(config, { filePath, dependencies });
};

export default loadRsbuildConfig;
