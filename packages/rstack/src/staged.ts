import lintStaged from 'lint-staged';
import { parseArgs } from './cli/args.ts';
import { printCommandHelp } from './cli/help.ts';
import { getRstackPluginRuntime, loadRstackConfig } from './config.ts';

export type StagedSyncTaskGenerator = (
  stagedFileNames: readonly string[],
) => string | string[];

export type StagedAsyncTaskGenerator = (
  stagedFileNames: readonly string[],
) => Promise<string | string[]>;

export type StagedTaskGenerator =
  StagedSyncTaskGenerator | StagedAsyncTaskGenerator;

export type StagedFunctionTask = {
  title: string;
  task: (stagedFileNames: readonly string[]) => void | Promise<void>;
};

export type StagedTask =
  | string
  | StagedFunctionTask
  | StagedTaskGenerator
  | (string | StagedTaskGenerator)[];

export type StagedConfig = Record<string, StagedTask> | StagedTaskGenerator;

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
    await printCommandHelp('staged');
    return;
  }

  const loaded = await loadRstackConfig();
  const runtime = await getRstackPluginRuntime(loaded);
  if (!loaded.configs.staged && !runtime.hasConfigModifier('staged')) {
    throw new Error(
      'No define.staged config found. Add define.staged({ "*": "your-command" }) to rstack config file',
    );
  }
  const stagedConfig = await runtime.applyConfigModifiers(
    'staged',
    loaded.configs.staged ?? {},
    {},
  );

  // Let child commands detect that they are running through `rs staged`.
  process.env.RSTACK_STAGED = '1';

  const success = await lintStaged({
    allowEmpty: values.allowEmpty,
    concurrent:
      values.concurrent === undefined
        ? undefined
        : (JSON.parse(values.concurrent) as boolean | number),
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
