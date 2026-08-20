import type {
  ConfigParams,
  RsbuildConfigDefinition,
  WatchFiles,
} from '@rsbuild/core';
import {
  applyRstackConfigModifiers,
  loadRstackConfig,
  type Configs,
} from './config.ts';

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
  const loaded = await loadRstackConfig();
  const { configs, filePath, dependencies } = loaded;
  const config = await applyRstackConfigModifiers(
    loaded,
    'app',
    await resolveRsbuildConfig(configs, params),
  );

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
        ...(watchFiles
          ? Array.isArray(watchFiles)
            ? watchFiles
            : [watchFiles]
          : []),
        watchConfig,
      ],
    },
  };
};

export default loadRsbuildConfig;
