import { join, resolve } from 'node:path';
import { getConfigState, getRstackPluginRuntime, loadRstackConfig } from '../config.ts';
import { insertConfigArg, parseArgs, parseCliArgs } from './args.ts';
import { hasHelpFlag, printCommandHelp } from './help.ts';

async function runRsbuildCLI(args: string[]): Promise<void> {
  if (hasHelpFlag(args)) {
    switch (args[0]) {
      case 'dev':
        return printCommandHelp('dev');
      case 'build':
        return printCommandHelp('build');
      case 'preview':
        return printCommandHelp('preview');
    }
  }

  const argv = [
    process.execPath,
    'rsbuild',
    ...insertConfigArg(args, '--config', join(import.meta.dirname, 'rsbuildConfig.js')),
  ];

  const { runCLI } = await import('@rsbuild/core');
  runCLI({ argv });
}

async function runRstestCLI(args: string[]): Promise<void> {
  if (hasHelpFlag(args)) {
    switch (args[0]) {
      case 'run':
        return printCommandHelp('test run');
      case 'watch':
        return printCommandHelp('test watch');
      case 'list':
        return printCommandHelp('test list');
      case 'merge-reports':
        return printCommandHelp('test merge-reports');
      case 'init':
        return printCommandHelp('test init');
      default:
        return printCommandHelp('test');
    }
  }

  const argv = [
    process.execPath,
    'rstest',
    ...insertConfigArg(args, '--config', join(import.meta.dirname, 'rstestConfig.js')),
  ];

  const { runCLI } = await import('@rstest/core');
  runCLI({ argv });
}

async function runRslibCLI(args: string[]): Promise<void> {
  if (hasHelpFlag(args)) {
    switch (args[0]) {
      case 'build':
        return printCommandHelp('lib build');
      case 'inspect':
        return printCommandHelp('lib inspect');
      case 'mf-dev':
        return printCommandHelp('lib mf-dev');
      default:
        return printCommandHelp('lib');
    }
  }

  const argv = [
    process.execPath,
    'rslib',
    ...insertConfigArg(args, '--config', join(import.meta.dirname, 'rslibConfig.js')),
  ];

  const { runCLI } = await import('@rslib/core');
  runCLI({ argv });
}

const isMissingRspressCoreError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = 'code' in error ? error.code : undefined;
  return code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('@rspress/core');
};

async function runRspressCLI(args: string[]): Promise<void> {
  if (hasHelpFlag(args)) {
    switch (args[0]) {
      case 'build':
        return printCommandHelp('doc build');
      case 'preview':
        return printCommandHelp('doc preview');
      case 'eject':
        return printCommandHelp('doc eject');
      default:
        return printCommandHelp('doc');
    }
  }

  const argv = [
    process.execPath,
    'rspress',
    ...insertConfigArg(args, '--config', join(import.meta.dirname, 'rspressConfig.js')),
  ];

  try {
    const { runCLI } = await import('@rspress/core');
    runCLI({ argv });
  } catch (error) {
    if (isMissingRspressCoreError(error)) {
      throw new Error(
        'The "rs doc" command requires "@rspress/core" dependency. Please install it.',
        { cause: error },
      );
    }
    throw error;
  }
}

async function runRslintCLI(args: string[]): Promise<void> {
  if (hasHelpFlag(args)) {
    return printCommandHelp('lint');
  }

  const argv = [
    process.execPath,
    'rslint',
    ...insertConfigArg(args, '--config', join(import.meta.dirname, 'rslintConfig.js')),
  ];

  const { runCLI } = await import('@rslint/core');
  await runCLI({ argv });
}

async function runCheckCLI(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      'type-check': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    return printCommandHelp('check');
  }

  await runRslintCLI(values.typeCheck ? ['--type-check'] : []);
  if (process.exitCode) {
    return;
  }

  const { runFmtCLI } = await import(
    /* rspackChunkName: 'fmt' */
    '../fmt/cli.ts'
  );
  await runFmtCLI(['--check']);
}

export async function setupCommands(): Promise<void> {
  const state = getConfigState();
  delete state.configPath;
  delete state.invocation;

  const { args, configPath } = parseCliArgs(process.argv.slice(2));
  const command = args[0];

  if (!command || command === '-h' || command === '--help') {
    return printCommandHelp('root');
  }

  if (command === '-v' || command === '--version') {
    console.log(`Rstack v${RSTACK_VERSION}`);
    return;
  }

  // Anchor a relative `--config` to the directory the CLI was invoked in,
  // even when a command later loads it from another directory (for example,
  // an LSP workspace root).
  state.configPath = configPath === undefined ? undefined : resolve(configPath);
  state.invocation = {
    cwd: process.cwd(),
    command,
    args: args.slice(1),
    configFilePath: null,
  };

  if (command === 'lib') {
    await runRslibCLI(args.slice(1));
    return;
  }

  if (command === 'doc') {
    await runRspressCLI(args.slice(1));
    return;
  }

  if (command === 'test') {
    await runRstestCLI(args.slice(1));
    return;
  }

  if (command === 'lint') {
    await runRslintCLI(args.slice(1));
    return;
  }

  if (command === 'check') {
    await runCheckCLI(args.slice(1));
    return;
  }

  if (command === 'fmt' || command === 'format') {
    const { runFmtCLI } = await import(
      /* rspackChunkName: 'fmt' */
      '../fmt/cli.ts'
    );
    await runFmtCLI(args.slice(1));
    return;
  }

  if (command === 'staged') {
    const { runStagedCLI } = await import(
      /* rspackChunkName: 'staged' */
      '../staged.ts'
    );
    await runStagedCLI(args.slice(1));
    return;
  }

  if (command === 'setup') {
    const { runSetupCLI } = await import(
      /* rspackChunkName: 'setup' */
      '../setup/index.ts'
    );
    await runSetupCLI(args.slice(1));
    return;
  }

  if (command === 'dev' || command === 'build' || command === 'preview') {
    await runRsbuildCLI(args);
    return;
  }

  const loaded = await loadRstackConfig();
  const runtime = await getRstackPluginRuntime(loaded);

  if (await runtime.runCommand(command, state.invocation.args)) {
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
