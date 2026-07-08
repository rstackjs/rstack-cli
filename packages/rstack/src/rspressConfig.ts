import type { UserConfig } from '@rspress/core';
import { loadRstackConfig, type Configs } from './config.js';

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
  const configs = await loadRstackConfig();
  return resolveRspressConfig(configs);
};
