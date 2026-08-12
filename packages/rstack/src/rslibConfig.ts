import type { ConfigParams, RslibConfig, RslibConfigDefinition } from '@rslib/core';
import { applyRstackConfigModifiers, loadRstackConfig, type Configs } from './config.ts';

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
  const loaded = await loadRstackConfig();
  return applyRstackConfigModifiers(
    loaded,
    'lib',
    await resolveRslibConfig(loaded.configs, params),
  );
}) as RslibConfigDefinition;

export default loadRslibConfig;
