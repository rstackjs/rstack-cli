import { mergeRsbuildConfig, type RsbuildConfigDefinition, type ConfigParams } from '@rsbuild/core';
import { loadRstackConfigWithMeta, type Configs } from './config.js';

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
  const { configs, filePath, dependencies } = await loadRstackConfigWithMeta();
  const config = await resolveRsbuildConfig(configs, params);

  if (!filePath) {
    return config;
  }

  return mergeRsbuildConfig(config, {
    dev: {
      watchFiles: {
        paths: [filePath, ...dependencies],
        type: 'reload-server',
      },
    },
  });
};

export default loadRsbuildConfig;
