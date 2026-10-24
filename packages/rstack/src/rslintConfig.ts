import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLI_CONFIG_PATH_ENV,
  loadRstackConfig,
  type LoadedRstackConfig,
} from './config.ts';
import type { RslintConfig } from '@rslint/core';
import { color, logger } from 'rslog';
import { resolveRslintConfig } from './configLayers.ts';

// Expose the loaded config so `rs check` can pass it to fmt instead of loading
// and executing the Rstack config a second time. Rslint also imports this
// module in its JS plugin workers, which get `--config` from the environment.
export const loadedConfig: LoadedRstackConfig = await loadRstackConfig({
  configFilePath: process.env[CLI_CONFIG_PATH_ENV],
});
const { configs } = loadedConfig;
const lintConfig = await resolveRslintConfig([configs]);

if (lintConfig === undefined) {
  logger.error(
    `No lint configuration found. Add ${color.cyan('define.lint(...)')} to your Rstack config file.`,
  );
  process.exit(1);
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

const hasExplicitProjectMode = lintEntries.some((entry) => {
  const options = entry.languageOptions?.parserOptions;
  return (
    options?.project !== undefined || options?.projectService !== undefined
  );
});

// Rslint's implicit tsconfig lookup also follows the internal config directory.
// Preserve the CWD lookup only when neither project option is explicitly set.
if (!hasExplicitProjectMode && existsSync(join(basePath, 'tsconfig.json'))) {
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
