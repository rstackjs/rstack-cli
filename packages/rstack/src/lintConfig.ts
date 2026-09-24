import type { RslintConfig } from '@rslint/core';
import type { Configs } from './config.ts';
import { resolveConfigLayers } from './configLayers.ts';

export const resolveRslintConfig = async (
  layers: readonly Configs[],
): Promise<RslintConfig | undefined> => {
  const configs = await resolveConfigLayers(layers, 'lint');
  return configs.length > 1 ? configs.flat() : configs[0];
};
