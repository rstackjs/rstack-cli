import { clearConfig, getConfig, loadRstackConfig } from './config.js';

const stagedHelpMessage = `Rstack v${RSTACK_VERSION}

Usage:
  $ rs staged

Runs lint-staged with tasks from define.staged in rstack.config.

Options:
  -h, --help  Display this help message`;

async function loadStagedConfig() {
  try {
    await loadRstackConfig();
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

  const { default: lintStaged } = await import(
    /* rspackChunkName: 'lintStaged' */
    'lint-staged'
  );
  const success = await lintStaged({
    config: stagedConfig,
  });
  if (!success) {
    process.exitCode = 1;
  }
}
