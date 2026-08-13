import { loadRstackConfig } from './config.ts';
import type { RslintConfig } from '@rslint/core';

const { configs } = await loadRstackConfig();
const lintDefinition = configs.lint ?? [];

let lintConfig: RslintConfig;

// TODO: support function in Rslint core
if (typeof lintDefinition === 'function') {
  lintConfig = await lintDefinition();
} else {
  lintConfig = lintDefinition;
}

export default lintConfig;
