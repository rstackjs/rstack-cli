import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

const basePath = process.cwd();
const lintEntries = lintConfig.flat();

// Rslint resolves entries without a basePath from the explicit config file.
// Rstack's explicit config is this internal module, so preserve the historical
// behavior of resolving user-authored paths from the invocation directory.
const resolvedLintConfig: RslintConfig = lintEntries.map((entry) => ({
  basePath,
  ...entry,
}));

const hasExplicitProject = lintEntries.some(
  (entry) => entry.languageOptions?.parserOptions?.project !== undefined,
);

// Rslint's implicit tsconfig lookup also follows the internal config directory.
// Preserve the CWD lookup without overriding user projects.
if (!hasExplicitProject && existsSync(join(basePath, 'tsconfig.json'))) {
  resolvedLintConfig.push({
    basePath,
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
  });
}

export default resolvedLintConfig;
