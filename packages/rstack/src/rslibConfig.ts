import type { ConfigParams, RslibConfig } from '@rslib/core';
import type { RslibConfigDefinition } from './config.js';
import { getConfig, clearConfig, loadRstackConfig } from './config.js';

const resolveRslibConfig = async (params: ConfigParams): Promise<RslibConfig> => {
  const libConfig = getConfig('lib');
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
  await loadRstackConfig();
  const libConfig = await resolveRslibConfig(params);
  clearConfig();
  return libConfig;
}) as RslibConfigDefinition;

export default loadRslibConfig;
