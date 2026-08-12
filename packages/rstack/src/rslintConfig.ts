import { applyRstackConfigModifiers, loadRstackConfig } from './config.ts';
import type { RslintConfig } from '@rslint/core';

const loaded = await loadRstackConfig();
const { configs } = loaded;
const lintExports = configs.lint ?? [];

let lintConfig: RslintConfig;

// TODO: support function in Rslint core
if (typeof lintExports === 'function') {
  lintConfig = await lintExports();
} else {
  lintConfig = lintExports;
}

const modifiedLintConfig: RslintConfig = await applyRstackConfigModifiers(
  loaded,
  'lint',
  lintConfig,
);

export default modifiedLintConfig;
