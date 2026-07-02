import { loadConfig, type RsbuildConfigDefinition } from '@rsbuild/core';
import { getConfig } from './define.js';
import { configFileNames } from './constants.js';

const loadRsbuildConfig: RsbuildConfigDefinition = async (params) => {
  await loadConfig({
    loader: 'native',
    configFileNames,
  });

  const configExport = getConfig('app');

  if (!configExport) {
    return {};
  }

  if (typeof configExport === 'function') {
    return configExport(params);
  }

  return configExport;
};

export default loadRsbuildConfig;
