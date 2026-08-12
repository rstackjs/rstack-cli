import lintStaged from 'lint-staged';
import { parseArgs } from './cli/args.ts';
import { renderHelp } from './cli/help.ts';
import { loadRstackConfig } from './config.ts';

export type StagedSyncTaskGenerator = (stagedFileNames: readonly string[]) => string | string[];

export type StagedAsyncTaskGenerator = (
  stagedFileNames: readonly string[],
) => Promise<string | string[]>;

export type StagedTaskGenerator = StagedSyncTaskGenerator | StagedAsyncTaskGenerator;

export type StagedFunctionTask = {
  title: string;
  task: (stagedFileNames: readonly string[]) => void | Promise<void>;
};

export type StagedTask =
  string | StagedFunctionTask | StagedTaskGenerator | (string | StagedTaskGenerator)[];

export type StagedConfig = Record<string, StagedTask> | StagedTaskGenerator;

const renderStagedHelp = (): string =>
  renderHelp({
    usage: 'rs staged [options]',
    description: 'Run tasks on staged Git files',
    sections: [
      {
        title: 'Options',
        items: [
          ['--allow-empty', 'Allow empty commits when tasks revert all staged changes'],
          [
            '-p, --concurrent <number|boolean>',
            'The number of tasks to run concurrently, or false for serial',
          ],
          ['--cwd <path>', 'Working directory to run all tasks in'],
          ['-d, --debug', 'Print additional debug information'],
          ['--no-stash', 'Disable backup stash and automatic revert'],
          ['-q, --quiet', "Disable lint-staged's own console output"],
          ['-r, --relative', 'Pass relative filepaths to tasks'],
          [
            '-v, --verbose',
            'Show task output even when tasks succeed; by default only failed output is shown',
          ],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

export async function runStagedCLI(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      'allow-empty': { type: 'boolean' },
      concurrent: { type: 'string', short: 'p' },
      cwd: { type: 'string' },
      debug: { type: 'boolean', short: 'd' },
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
    console.log(renderStagedHelp());
    return;
  }

  const { configs } = await loadRstackConfig();
  const stagedConfig = configs.staged;
  if (!stagedConfig) {
    throw new Error(
      'No define.staged config found. Add define.staged({ "*": "your-command" }) to rstack config file',
    );
  }

  // Let child commands detect that they are running through `rs staged`.
  process.env.RSTACK_STAGED = '1';

  const success = await lintStaged({
    allowEmpty: values.allowEmpty,
    concurrent: values.concurrent === undefined ? undefined : JSON.parse(values.concurrent),
    config: stagedConfig,
    cwd: values.cwd,
    debug: values.debug,
    quiet: values.quiet,
    relative: values.relative,
    stash: values.noStash ? false : undefined,
    verbose: values.verbose,
  });
  if (!success) {
    process.exitCode = 1;
  }
}
