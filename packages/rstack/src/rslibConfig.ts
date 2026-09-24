import {
  type ConfigParams,
  type RslibConfig,
  type RslibConfigDefinition,
  mergeRslibConfig,
} from '@rslib/core';
import { withConfigMeta } from '@rstackjs/load-config';
import { loadRstackConfig, type Configs } from './config.ts';
import { resolveConfigLayers } from './configLayers.ts';

export const resolveRslibConfig = async (
  layers: readonly Configs[],
  params: ConfigParams,
): Promise<RslibConfig> => {
  const configs = await resolveConfigLayers(layers, 'lib', params);
  return configs.length > 1 ? mergeRslibConfig(...configs) : (configs[0] ?? {});
};

const loadRslibConfig = (async (params: ConfigParams) => {
  const { configs, filePath, dependencies } = await loadRstackConfig();
  const config = await resolveRslibConfig([configs], params);

  return withConfigMeta(config, { filePath, dependencies });
}) as RslibConfigDefinition;

export default loadRslibConfig;
