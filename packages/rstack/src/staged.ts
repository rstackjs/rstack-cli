import { parseArgs } from 'node:util';
import { loadRstackConfig } from './config.js';

const stagedHelpMessage = `Rstack v${RSTACK_VERSION}

Usage:
  $ rs staged [options]

Runs lint-staged with tasks from define.staged in rstack.config.

Options:
  --allow-empty                      Allow empty commits when tasks revert all staged changes
  -p, --concurrent <number|boolean>  The number of tasks to run concurrently, or false for serial
  --cwd <path>                       Working directory to run all tasks in
  --no-stash                         Disable the backup stash. Implies "--no-revert".
  -q, --quiet                        Disable lint-staged's own console output
  -r, --relative                     Pass relative filepaths to tasks
  -v, --verbose                      Show task output even when tasks succeed; by default only failed output is shown
  -h, --help                         Display this help message`;

export async function runStagedCLI(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      'allow-empty': { type: 'boolean' },
      allowEmpty: { type: 'boolean' },
      concurrent: { type: 'string', short: 'p' },
      cwd: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      'no-stash': { type: 'boolean' },
      quiet: { type: 'boolean', short: 'q' },
      relative: { type: 'boolean', short: 'r' },
      verbose: { type: 'boolean', short: 'v' },
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
    cwd: values.cwd,
    quiet: values.quiet ?? false,
    relative: values.relative ?? false,
    stash: !values['no-stash'],
    verbose: values.verbose ?? false,
  });
  if (!success) {
    process.exitCode = 1;
  }
}
