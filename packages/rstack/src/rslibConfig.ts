import type { ConfigParams, RslibConfig } from '@rslib/core';
import { loadRstackConfig, type Configs } from './config.ts';
import {
  appendBuildContextPlugin,
  createBuildContextPlugin,
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
  const config = await resolveRslibConfig(loaded.configs, params);
  const capture = resolveContextCapture(loaded.configs.context);
  if (capture === 'off') {
    return config;
  }
  const workspace = await resolveContextWorkspace(loaded.filePath ?? process.cwd());
  return appendBuildContextPlugin(
    config,
    createBuildContextPlugin({
      producer: 'rslib',
      product: 'library',
      capture,
      workspace,
      configPath: loaded.filePath ?? undefined,
      params,
    }),
  );
};

export default loadRslibConfig;
