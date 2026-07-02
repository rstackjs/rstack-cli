import { join } from 'node:path';

declare global {
  const RSTACK_VERSION: string;
}

const helpMessage = `Rstack v${RSTACK_VERSION}

Usage:
  $ rs [command] [options]

Commands:
  dev      [Rsbuild] Start the dev server
  build    [Rsbuild] Build the app for production
  preview  [Rsbuild] Preview the production build locally
  test     [Rstest]  Run tests

  For details on a sub-command, run:
  $ rs <command> -h

Options:
  -v, --version             Display version number`;

async function runRsbuildCLI(args: string[]): Promise<void> {
  const argv = [
    process.execPath,
    'rsbuild',
    ...args,
    '-c',
    join(import.meta.dirname, 'rsbuildConfig.js'),
  ];

  const { runCLI } = await import('@rsbuild/core');
  runCLI({ argv });
}

async function runRstestCLI(args: string[]): Promise<void> {
  process.argv = [
    process.execPath,
    'rstest',
    ...args,
    '-c',
    join(import.meta.dirname, 'rstestConfig.js'),
  ];
  const { runCLI } = await import('@rstest/core');
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

  if (command === 'test') {
    await runRstestCLI(args.slice(1));
    return;
  }

  if (command === 'dev' || command === 'build' || command === 'preview') {
    await runRsbuildCLI(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
