import { loadConfig } from '@rsbuild/core';
import type { RstestConfig } from '@rstest/core';
import { getConfig } from './define.js';

export default async function loadRstestConfig(): Promise<RstestConfig> {
  await loadConfig({
    configFileNames: ['rstack.config.ts'],
  });

  const configDefinition = getConfig('test');

  if (!configDefinition) {
    return {};
  }

  if (typeof configDefinition === 'function') {
    return configDefinition();
  }

  return configDefinition;
}
