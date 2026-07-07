import { loadRstackConfig } from './config.js';
import type { RslintConfig } from '@rslint/core';

const configs = await loadRstackConfig();
const lintExports = configs.lint ?? [];

let lintConfig: RslintConfig;

// TODO: support function in Rslint core
if (typeof lintExports === 'function') {
  lintConfig = await lintExports();
} else {
  lintConfig = lintExports;
}

export default lintConfig;
