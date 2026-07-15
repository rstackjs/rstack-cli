import type { ConfigParams, RslibConfig, RslibConfigDefinition } from '@rslib/core';
import { loadRstackConfig, type Configs } from './config.js';

const resolveRslibConfig = async (configs: Configs, params: ConfigParams): Promise<RslibConfig> => {
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
  const { configs } = await loadRstackConfig();
  return resolveRslibConfig(configs, params);
}) as RslibConfigDefinition;

export default loadRslibConfig;
