import type { ConfigParams, RsbuildConfig, WatchFiles } from '@rsbuild/core';
import {
  applyRstackConfigModifiers,
  loadRstackConfig,
  type Configs,
} from './config.ts';

export const resolveRsbuildConfig = async (
  configs: Configs,
  params: ConfigParams,
): Promise<RsbuildConfig> => {
  const appConfig = configs.app;
  if (!appConfig) {
    return {};
  }
  if (typeof appConfig === 'function') {
    return appConfig(params);
  }
  return appConfig;
};

export const loadRsbuildConfig = async (
  params: ConfigParams,
): Promise<RsbuildConfig> => {
  const loaded = await loadRstackConfig();
  const config = await applyRstackConfigModifiers(
    loaded,
    'app',
    await resolveRsbuildConfig(loaded.configs, params),
    { params },
  );

  if (!loaded.filePath) {
    return config;
  }

  const watchFiles = config.dev?.watchFiles;
  const watchConfig: WatchFiles = {
    paths: [loaded.filePath, ...loaded.dependencies],
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
