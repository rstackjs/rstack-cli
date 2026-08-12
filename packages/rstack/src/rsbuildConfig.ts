import type { ConfigParams, RsbuildConfig, WatchFiles } from '@rsbuild/core';
import { loadRstackConfig, type Configs } from './config.ts';
import {
  appendBuildContextPlugin,
  createBuildContextPlugin,
  resolveContextCapture,
  resolveContextWorkspace,
} from './context/index.ts';

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

export const loadRsbuildConfig = async (params: ConfigParams): Promise<RsbuildConfig> => {
  const loaded = await loadRstackConfig();
  const config = await resolveRsbuildConfig(loaded.configs, params);
  const capture = resolveContextCapture(loaded.configs.context);
  const configWithContext =
    capture === 'off'
      ? config
      : appendBuildContextPlugin(
          config,
          createBuildContextPlugin({
            producer: 'rsbuild',
            product: 'application',
            capture,
            workspace: await resolveContextWorkspace(loaded.filePath ?? process.cwd()),
            configPath: loaded.filePath ?? undefined,
            params,
          }),
        );

  if (!loaded.filePath) {
    return configWithContext;
  }

  const watchFiles = configWithContext.dev?.watchFiles;
  const watchConfig: WatchFiles = {
    paths: [loaded.filePath, ...loaded.dependencies],
    type: 'reload-server',
  };

  return {
    ...configWithContext,
    dev: {
      ...configWithContext.dev,
      watchFiles: [
        ...(watchFiles ? (Array.isArray(watchFiles) ? watchFiles : [watchFiles]) : []),
        watchConfig,
      ],
    },
  };
};

export default loadRsbuildConfig;
