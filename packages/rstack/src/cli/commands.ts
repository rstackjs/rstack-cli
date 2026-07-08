import { join } from 'node:path';
import { getConfigState } from '../config.js';
import { runStagedCLI } from '../staged.js';
import { insertConfigArg, parseCliArgs } from './args.js';

declare global {
  const RSTACK_VERSION: string;
}

const helpMessage = `Rstack v${RSTACK_VERSION}

Usage:
  $ rs [command] [...options]

Commands:
  dev      Start the app dev server
  build    Build the app for production
  preview  Preview the app production build locally
  lib      Build library outputs
  doc      Develop and build docs
  lint     Run lint checks
  test     Run tests
  staged   Run configured tasks on staged Git files

For command-specific options, run:
  $ rs <command> -h

Options:
  -c, --config <path>       Specify Rstack config file path
  -h, --help                Display this help message
  -v, --version             Display version number`;

async function runRsbuildCLI(args: string[]): Promise<void> {
  const argv = [
    process.execPath,
    'rsbuild',
    ...insertConfigArg(args, '--config', join(import.meta.dirname, 'rsbuildConfig.js')),
  ];

  const { runCLI } = await import('@rsbuild/core');
  runCLI({ argv });
}

async function runRstestCLI(args: string[]): Promise<void> {
  const argv = [
    process.execPath,
    'rstest',
    ...insertConfigArg(args, '--config', join(import.meta.dirname, 'rstestConfig.js')),
  ];

  const { runCLI } = await import('@rstest/core');
  runCLI({ argv });
}

async function runRslibCLI(args: string[]): Promise<void> {
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
  const argv = [
    process.execPath,
    'rslint',
    ...insertConfigArg(args, '--config', join(import.meta.dirname, 'rslintConfig.js')),
  ];

  const { runCLI } = await import('@rslint/core');
  await runCLI({ argv });
}

export async function setupCommands(): Promise<void> {
  const { args, configPath } = parseCliArgs(process.argv.slice(2));
  const command = args[0];

  getConfigState().configPath = configPath;

  if (!command || command === '-h' || command === '--help') {
    console.log(helpMessage);
    return;
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

  if (command === 'staged') {
    await runStagedCLI(args.slice(1));
    return;
  }

  if (command === 'dev' || command === 'build' || command === 'preview') {
    await runRsbuildCLI(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
