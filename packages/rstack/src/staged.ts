import { loadConfig } from '@rsbuild/core';
import lintStaged from 'lint-staged';
import { configFileNames } from './constants.js';
import { clearConfig, getConfig } from './define.js';

const stagedHelpMessage = `Rstack v${RSTACK_VERSION}

Usage:
  $ rs staged

Runs lint-staged with tasks from define.staged in rstack.config.

Options:
  -h, --help  Display this help message`;

async function loadStagedConfig() {
  try {
    await loadConfig({
      loader: 'native',
      configFileNames,
    });
    return getConfig('staged');
  } finally {
    clearConfig();
  }
}

export async function runStagedCLI(args: string[]): Promise<void> {
  if (args.length === 1 && (args[0] === '-h' || args[0] === '--help')) {
    console.log(stagedHelpMessage);
    return;
  }

  const stagedConfig = await loadStagedConfig();
  if (!stagedConfig) {
    throw new Error(
      'No define.staged config found. Add define.staged({ "*": "your-command" }) to rstack config file',
    );
  }

  const success = await lintStaged({
    config: stagedConfig,
  });
  if (!success) {
    process.exitCode = 1;
  }
}
