import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getConfigState } from '../config.ts';
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
    ...insertConfigArg(
      args,
      '--config',
      join(import.meta.dirname, 'rsbuildConfig.js'),
    ),
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
    ...insertConfigArg(
      args,
      '--config',
      join(import.meta.dirname, 'rstestConfig.js'),
    ),
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
    ...insertConfigArg(
      args,
      '--config',
      join(import.meta.dirname, 'rslibConfig.js'),
    ),
  ];

  const { runCLI } = await import('@rslib/core');
  runCLI({ argv });
}

const isMissingRspressCoreError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = 'code' in error ? error.code : undefined;
  return (
    code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('@rspress/core')
  );
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
    ...insertConfigArg(
      args,
      '--config',
      join(import.meta.dirname, 'rspressConfig.js'),
    ),
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

const RSLINT_CONFIG_PATH = join(import.meta.dirname, 'rslintConfig.js');

async function runRslintCLI(args: string[]): Promise<void> {
  if (hasHelpFlag(args)) {
    return printCommandHelp('lint');
  }

  const argv = [
    process.execPath,
    'rslint',
    ...insertConfigArg(args, '--config', RSLINT_CONFIG_PATH),
  ];

  const { runCLI } = await import('@rslint/core');
  await runCLI({ argv });
}

async function runCheckCLI(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      fix: { type: 'boolean' },
      'type-check': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    return printCommandHelp('check');
  }

  // Keep file arguments after `--` when forwarding them so names beginning
  // with a hyphen are not reinterpreted as child-command options.
  const fileArgs = positionals.length > 0 ? ['--', ...positionals] : [];
  await runRslintCLI([
    ...(values.fix ? ['--fix'] : []),
    ...(values.typeCheck ? ['--type-check'] : []),
    ...fileArgs,
  ]);
  if (process.exitCode) {
    return;
  }

  // Rslint loads its one-shot config through Node's module cache. Import the
  // same URL to read the Rstack config exported for the following fmt phase.
  const { loadedConfig } = (await import(
    pathToFileURL(RSLINT_CONFIG_PATH).href
  )) as typeof import('../rslintConfig.ts');
  const { runFmtCLI } = await import(
    /* rspackChunkName: 'fmt' */
    '../fmt/cli.ts'
  );
  await runFmtCLI([values.fix ? '--write' : '--check', ...fileArgs], {
    fixOption: '--fix',
    loadedConfig,
  });
}

export async function setupCommands(): Promise<void> {
  const { args, configPath } = parseCliArgs(process.argv.slice(2));
  const command = args[0];

  // Resolved for every command so that a relative `--config` path always means
  // the same file: it is anchored to the directory the CLI was invoked in, even
  // when the config is later loaded from another directory. The motivating case
  // is `rs fmt --lsp`, which loads the config from the LSP workspace root the
  // client reports, and that root need not be the process working directory.
  getConfigState().configPath =
    configPath === undefined ? undefined : resolve(configPath);

  if (!command || command === '-h' || command === '--help') {
    return printCommandHelp('root');
  }

  if (command === '-v' || command === '--version') {
    console.log(`Rstack v${RSTACK_VERSION}`);
    return;
  }

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

  if (command === 'hooks') {
    const { runHooksCLI } = await import(
      /* rspackChunkName: 'hooks' */
      '../setup/index.ts'
    );
    await runHooksCLI(args.slice(1));
    return;
  }

  if (command === 'dev' || command === 'build' || command === 'preview') {
    await runRsbuildCLI(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
