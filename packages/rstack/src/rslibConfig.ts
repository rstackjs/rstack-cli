import { realpath } from 'node:fs/promises';
import type { ConfigParams, RslibConfig } from '@rslib/core';
import { loadRstackConfig, type Configs } from './config.ts';
import {
  appendBuildContextPlugin,
  createBuildContextPlugin,
  recordContextInputFiles,
  resolveContextCapture,
  resolveContextWorkspace,
} from './context/index.ts';

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
  const configPath = loaded.filePath === null ? undefined : await realpath(loaded.filePath);
  const config = await resolveRslibConfig(loaded.configs, params);
  const capture = resolveContextCapture(loaded.configs.context);
  if (capture === 'off') {
    return config;
  }
  const workspace = await resolveContextWorkspace(configPath ?? process.cwd());
  const inputs =
    configPath === undefined
      ? undefined
      : await recordContextInputFiles(workspace.workspaceRoot, [
          ...new Set([configPath, ...loaded.dependencies]),
        ]);
  return appendBuildContextPlugin(
    config,
    createBuildContextPlugin({
      producer: 'rslib',
      product: 'library',
      capture,
      workspace,
      configPath,
      params,
      variant: loaded.configs.context?.variant,
      inputs,
    }),
  );
};

export default loadRslibConfig;
