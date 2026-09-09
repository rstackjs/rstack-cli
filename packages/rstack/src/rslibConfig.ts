import type {
  ConfigParams,
  RslibConfig,
  RslibConfigDefinition,
} from '@rslib/core';
import { withConfigMeta } from '@rstackjs/load-config';
import { loadRstackConfig, type Configs } from './config.ts';

const resolveRslibConfig = async (
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

const loadRslibConfig = (async (params: ConfigParams) => {
  const { configs, filePath, dependencies } = await loadRstackConfig();
  const config = await resolveRslibConfig(configs, params);

  return withConfigMeta(config, { filePath, dependencies });
}) as RslibConfigDefinition;

export default loadRslibConfig;
