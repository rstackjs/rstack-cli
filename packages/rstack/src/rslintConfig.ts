import { applyRstackConfigModifiers, loadRstackConfig } from './config.ts';
import type { RslintConfig } from '@rslint/core';

const loaded = await loadRstackConfig();
const { configs } = loaded;
const lintDefinition = configs.lint ?? [];

let lintConfig: RslintConfig;

// TODO: support function in Rslint core
if (typeof lintDefinition === 'function') {
  lintConfig = await lintDefinition();
} else {
  lintConfig = lintDefinition;
}

const modifiedLintConfig: RslintConfig = await applyRstackConfigModifiers(
  loaded,
  'lint',
  lintConfig,
);

export default modifiedLintConfig;
