import type { WatchFiles } from '@rsbuild/core';
import type { UserConfig } from '@rspress/core';
import { loadRstackConfig, type Configs } from './config.ts';
import { resolveConfigLayers } from './configLayers.ts';

export const resolveRspressConfig = async (
  layers: readonly Configs[],
): Promise<UserConfig> => {
  const configs = await resolveConfigLayers(layers, 'doc');
  if (configs.length <= 1) {
    return configs[0] ?? {};
  }

  const { mergeDocConfig } = await import('@rspress/core');
  return mergeDocConfig(...configs);
};

export default async (): Promise<UserConfig> => {
  const { configs, filePath, dependencies } = await loadRstackConfig();
  const config = await resolveRspressConfig([configs]);

  if (!filePath) {
    return config;
  }

  const watchFiles = config.builderConfig?.dev?.watchFiles;
  const watchConfig: WatchFiles = {
    paths: [filePath, ...dependencies],
    type: 'restart',
  };

  return {
    ...config,
    builderConfig: {
      ...config.builderConfig,
      dev: {
        ...config.builderConfig?.dev,
        watchFiles: [
          ...(watchFiles
            ? Array.isArray(watchFiles)
              ? watchFiles
              : [watchFiles]
            : []),
          watchConfig,
        ],
      },
    },
  };
};
