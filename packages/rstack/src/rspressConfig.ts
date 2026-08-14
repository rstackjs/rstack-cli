import type { WatchFiles } from '@rsbuild/core';
import type { UserConfig } from '@rspress/core';
import { applyRstackConfigModifiers, loadRstackConfig, type Configs } from './config.ts';

const resolveRspressConfig = async (configs: Configs): Promise<UserConfig> => {
  const docConfig = configs.doc;
  if (!docConfig) {
    return {};
  }
  if (typeof docConfig === 'function') {
    return docConfig();
  }
  return docConfig;
};

export default async (): Promise<UserConfig> => {
  const loaded = await loadRstackConfig();
  const config = await applyRstackConfigModifiers(
    loaded,
    'doc',
    await resolveRspressConfig(loaded.configs),
    {},
  );

  if (!loaded.filePath) {
    return config;
  }

  const watchFiles = config.builderConfig?.dev?.watchFiles;
  const watchConfig: WatchFiles = {
    paths: [loaded.filePath, ...loaded.dependencies],
    type: 'restart',
  };

  return {
    ...config,
    builderConfig: {
      ...config.builderConfig,
      dev: {
        ...config.builderConfig?.dev,
        watchFiles: [
          ...(watchFiles ? (Array.isArray(watchFiles) ? watchFiles : [watchFiles]) : []),
          watchConfig,
        ],
      },
    },
  };
};
