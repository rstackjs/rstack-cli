import { loadRstackConfig, type LoadedRstackConfig } from './config.ts';
import type { RslintConfig } from '@rslint/core';

// Expose the loaded config so `rs check` can pass it to fmt instead of loading
// and executing the Rstack config a second time.
export const loadedConfig: LoadedRstackConfig = await loadRstackConfig();
const { configs } = loadedConfig;
const lintDefinition = configs.lint ?? [];

let lintConfig: RslintConfig;

// TODO: support function in Rslint core
if (typeof lintDefinition === 'function') {
  lintConfig = await lintDefinition();
} else {
  lintConfig = lintDefinition;
}

export default lintConfig;
