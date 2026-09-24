import {
  type ConfigParams,
  type RsbuildConfig,
  type RsbuildConfigDefinition,
  mergeRsbuildConfig,
} from '@rsbuild/core';
import { withConfigMeta } from '@rstackjs/load-config';
import { loadRstackConfig, type Configs } from './config.ts';
import { resolveConfigLayers } from './configLayers.ts';

export const resolveRsbuildConfig = async (
  layers: readonly Configs[],
  params: ConfigParams,
): Promise<RsbuildConfig> => {
  const configs = await resolveConfigLayers(layers, 'app', params);
  return configs.length > 1
    ? mergeRsbuildConfig(...configs)
    : (configs[0] ?? {});
};

const loadRsbuildConfig: RsbuildConfigDefinition = async (params) => {
  const { configs, filePath, dependencies } = await loadRstackConfig();
  const config = await resolveRsbuildConfig([configs], params);

  return withConfigMeta(config, { filePath, dependencies });
};

export default loadRsbuildConfig;
