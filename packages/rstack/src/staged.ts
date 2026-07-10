import { parseArgs } from 'node:util';
import { loadRstackConfig } from './config.js';

const stagedHelpMessage = `Rstack v${RSTACK_VERSION}

Usage:
  $ rs staged [options]

Runs lint-staged with tasks from define.staged in rstack.config.

Options:
  --allow-empty                      allow empty commits when tasks revert all staged changes
  -p, --concurrent <number|boolean>  the number of tasks to run concurrently, or false for serial
  -h, --help                         Display this help message`;

export async function runStagedCLI(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      'allow-empty': { type: 'boolean' },
      allowEmpty: { type: 'boolean' },
      concurrent: { type: 'string', short: 'p' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    console.log(stagedHelpMessage);
    return;
  }

  const configs = await loadRstackConfig();
  const stagedConfig = configs.staged;
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
    allowEmpty: values['allow-empty'] ?? values.allowEmpty ?? false,
    concurrent: values.concurrent === undefined ? true : JSON.parse(values.concurrent),
    config: stagedConfig,
  });
  if (!success) {
    process.exitCode = 1;
  }
}
