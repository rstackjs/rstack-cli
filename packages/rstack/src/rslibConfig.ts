import type { WatchFiles } from '@rsbuild/core';
import type { ConfigParams, RslibConfig } from '@rslib/core';
import { applyRstackConfigModifiers, loadRstackConfig, type Configs } from './config.ts';

export const resolveRslibConfig = async (
  configs: Configs,
  params: ConfigParams,
): Promise<RslibConfig> => {
  const libConfig = configs.lib;
  if (!libConfig) {
    return {};
  }
  if (typeof libConfig === 'function') {
    return libConfig(params);
  }
  return libConfig;
};

export const loadRslibConfig = async (params: ConfigParams): Promise<RslibConfig> => {
  const loaded = await loadRstackConfig();
  const config = await applyRstackConfigModifiers(
    loaded,
    'lib',
    await resolveRslibConfig(loaded.configs, params),
    { params },
  );

  if (!loaded.filePath) {
    return config;
  }

  const watchFiles = config.dev?.watchFiles;
  const watchConfig: WatchFiles = {
    paths: [loaded.filePath, ...loaded.dependencies],
    type: 'restart',
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

export default loadRslibConfig;
