import { realpath } from 'node:fs/promises';
import type {
  ConfigParams,
  RsbuildConfig,
  RsbuildConfigDefinition,
  WatchFiles,
} from '@rsbuild/core';
import {
  appendBuildContextPlugin,
  createBuildContextPlugin,
  recordContextInputFiles,
  resolveContextCapture,
  resolveContextWorkspace,
} from '@rstackjs/context';
import { applyRstackConfigModifiers, loadRstackConfig, type Configs } from './config.ts';

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

export const loadRsbuildConfig: RsbuildConfigDefinition = async (params) => {
  const loaded = await loadRstackConfig();
  const configPath = loaded.filePath === null ? undefined : await realpath(loaded.filePath);
  const config = await applyRstackConfigModifiers(
    loaded,
    'app',
    await resolveRsbuildConfig(loaded.configs, params),
  );
  const capture = resolveContextCapture(loaded.configs.context);
  let configWithContext = config;
  if (capture !== 'off') {
    const workspace = await resolveContextWorkspace(configPath ?? process.cwd());
    const inputs =
      configPath === undefined
        ? undefined
        : await recordContextInputFiles(workspace.workspaceRoot, [
            ...new Set([configPath, ...loaded.dependencies]),
          ]);
    configWithContext = appendBuildContextPlugin(
      config,
      createBuildContextPlugin({
        producer: 'rsbuild',
        product: 'application',
        capture,
        workspace,
        configPath,
        params,
        variant: loaded.configs.context?.variant,
        inputs,
      }),
    );
  }

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
