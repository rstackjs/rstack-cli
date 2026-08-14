import type { WatchFiles } from '@rsbuild/core';
import type { UserConfig } from '@rspress/core';
import { loadRstackConfig, type Configs } from './config.ts';

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
  const { configs, filePath, dependencies } = await loadRstackConfig();
  const config = await resolveRspressConfig(configs);

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
          ...(watchFiles ? (Array.isArray(watchFiles) ? watchFiles : [watchFiles]) : []),
          watchConfig,
        ],
      },
    },
  };
};
