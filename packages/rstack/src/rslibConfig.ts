import type { WatchFiles } from '@rsbuild/core';
import type {
  ConfigParams,
  RslibConfig,
  RslibConfigDefinition,
} from '@rslib/core';
import {
  applyRstackConfigModifiers,
  loadRstackConfig,
  type Configs,
} from './config.ts';

const resolveRslibConfig = async (
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

const loadRslibConfig = (async (params: ConfigParams) => {
  const loaded = await loadRstackConfig();
  const config = await applyRstackConfigModifiers(
    loaded,
    'lib',
    await resolveRslibConfig(loaded.configs, params),
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
        ...(watchFiles
          ? Array.isArray(watchFiles)
            ? watchFiles
            : [watchFiles]
          : []),
        watchConfig,
      ],
    },
  };
}) as RslibConfigDefinition;

export default loadRslibConfig;
