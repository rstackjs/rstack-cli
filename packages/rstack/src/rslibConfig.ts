import { loadConfig } from '@rsbuild/core';
import type { ConfigParams, RslibConfig } from '@rslib/core';
import type { RslibConfigDefinition } from './define.js';
import { getConfig, clearConfig } from './define.js';
import { configFileNames } from './constants.js';

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
  await loadConfig({
    loader: 'native',
    configFileNames,
  });

  const libConfig = await resolveRslibConfig(params);
  clearConfig();
  return libConfig;
}) as RslibConfigDefinition;

export default loadRslibConfig;
