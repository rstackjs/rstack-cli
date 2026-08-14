import type { ConfigParams, RslibConfig } from '@rslib/core';
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
  return applyRstackConfigModifiers(
    loaded,
    'lib',
    await resolveRslibConfig(loaded.configs, params),
    { params },
  );
};

export default loadRslibConfig;
