import type { ConfigParams, RslibConfig } from '@rslib/core';
import { loadRstackConfig, type Configs, type RslibConfigDefinition } from './config.js';

const resolveRslibConfig = async (configs: Configs, params: ConfigParams): Promise<RslibConfig> => {
  const libConfig = configs.lib;
  if (!libConfig) {
    // TODO: should allow empty object to be returned
    return { lib: [{}] };
  }
  if (typeof libConfig === 'function') {
    return libConfig(params);
  }
  return libConfig;
};

const loadRslibConfig = (async (params: ConfigParams) => {
  const configs = await loadRstackConfig();
  return resolveRslibConfig(configs, params);
}) as RslibConfigDefinition;

export default loadRslibConfig;
