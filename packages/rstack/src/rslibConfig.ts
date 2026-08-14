import { realpath } from 'node:fs/promises';
import type { ConfigParams, RslibConfig } from '@rslib/core';
import {
  appendBuildContextPlugin,
  createBuildContextPlugin,
  recordContextInputFiles,
  resolveContextCapture,
  resolveContextWorkspace,
} from '@rstackjs/context';
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
  const configPath = loaded.filePath === null ? undefined : await realpath(loaded.filePath);
  const config = await applyRstackConfigModifiers(
    loaded,
    'lib',
    await resolveRslibConfig(loaded.configs, params),
    { params },
  );
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
