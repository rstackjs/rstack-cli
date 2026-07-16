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

  config.dev ||= {};
  const { dev } = config;
  const watchConfig: WatchFiles = {
    paths: [filePath, ...dependencies],
    type: 'reload-server',
  };

  if (!dev.watchFiles) {
    dev.watchFiles = watchConfig;
  } else if (Array.isArray(dev.watchFiles)) {
    dev.watchFiles.push(watchConfig);
  } else {
    dev.watchFiles = [dev.watchFiles, watchConfig];
  }

  return config;
};

export default loadRsbuildConfig;
