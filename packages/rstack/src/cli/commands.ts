import { join } from 'node:path';
import { runStagedCLI } from '../staged.js';

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
  test     Run tests
  staged   Run configured tasks on staged Git files

For command-specific options, run:
  $ rs <command> -h

Options:
  -h, --help                Display this help message
  -v, --version             Display version number`;

function hasConfigArg(args: string[]): boolean {
  return args.some((arg) => arg === '-c' || arg === '--config' || arg.startsWith('--config='));
}

async function runRsbuildCLI(args: string[]): Promise<void> {
  const argv = [process.execPath, 'rsbuild', ...args];

  if (!hasConfigArg(args)) {
    argv.push('--config', join(import.meta.dirname, 'rsbuildConfig.js'));
  }

  const { runCLI } = await import('@rsbuild/core');
  runCLI({ argv });
}

async function runRstestCLI(args: string[]): Promise<void> {
  const argv = [process.execPath, 'rstest', ...args];

  if (!hasConfigArg(args)) {
    argv.push('-c', join(import.meta.dirname, 'rstestConfig.js'));
  }

  // TODO
  process.argv = argv;

  const { runCLI } = await import('@rstest/core');
  runCLI();
}

async function runRslibCLI(args: string[]): Promise<void> {
  const argv = [process.execPath, 'rslib', ...args];

  if (!hasConfigArg(args)) {
    argv.push('-c', join(import.meta.dirname, 'rslibConfig.js'));
  }

  // TODO
  process.argv = argv;

  const { runCLI } = await import('@rslib/core');
  runCLI();
}

export async function setupCommands(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

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

  if (command === 'test') {
    await runRstestCLI(args.slice(1));
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
