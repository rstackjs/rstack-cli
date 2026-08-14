import type { UserConfig } from '@rspress/core';
import { applyRstackConfigModifiers, loadRstackConfig, type Configs } from './config.ts';

const resolveRspressConfig = async (configs: Configs): Promise<UserConfig> => {
  const docConfig = configs.doc;
  if (!docConfig) {
    return {};
  }
  if (typeof docConfig === 'function') {
    return docConfig();
  }
  return docConfig;
};

export default async (): Promise<UserConfig> => {
  const loaded = await loadRstackConfig();
  return applyRstackConfigModifiers(loaded, 'doc', await resolveRspressConfig(loaded.configs), {});
};
