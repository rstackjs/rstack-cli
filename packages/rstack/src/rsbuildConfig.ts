import type { ConfigParams, RsbuildConfigDefinition, WatchFiles } from '@rsbuild/core';
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
  const { configs, filePath, dependencies } = await loadRstackConfig();
  const config = await resolveRsbuildConfig(configs, params);

  if (!filePath) {
    return config;
  }

  const watchFiles = config.dev?.watchFiles;
  const watchConfig: WatchFiles = {
    paths: [filePath, ...dependencies],
    type: 'reload-server',
  };

  return {
    ...config,
    dev: {
      ...config.dev,
      watchFiles: [
        ...(watchFiles ? (Array.isArray(watchFiles) ? watchFiles : [watchFiles]) : []),
        watchConfig,
      ],
    },
  };
};

export default loadRsbuildConfig;
