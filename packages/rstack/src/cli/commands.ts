import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { setConfigPath } from '../config.js';
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
  lint     Run lint checks
  test     Run tests
  staged   Run configured tasks on staged Git files

For command-specific options, run:
  $ rs <command> -h

Options:
  -c, --config <path>       Specify Rstack config file path
  -h, --help                Display this help message
  -v, --version             Display version number`;

type ParsedRstackArgs = {
  args: string[];
  configPath?: string;
};

function parseCliArgs(args: string[]): ParsedRstackArgs {
  const { tokens } = parseArgs({
    args,
    options: {
      config: { type: 'string', short: 'c' },
    },
    strict: false,
    allowPositionals: true,
    tokens: true,
  });

  let removedIndexes: number[] | undefined;
  let configPath: string | undefined;

  for (const token of tokens) {
    if (token.kind === 'option-terminator') {
      break;
    }

    // parseArgs expands short option groups like `-abc`; only consume `-c` when it starts the raw arg.
    if (
      token.kind !== 'option' ||
      token.name !== 'config' ||
      (token.rawName === '-c' && !args[token.index].startsWith('-c'))
    ) {
      continue;
    }

    if (token.value === undefined || token.value.length === 0) {
      throw new Error(`Missing value for ${token.rawName}.`);
    }

    configPath = token.value;
    const indexes = (removedIndexes ??= []);
    indexes.push(token.index);

    if (!token.inlineValue) {
      indexes.push(token.index + 1);
    }
  }

  if (!removedIndexes) {
    return { args };
  }

  return {
    args: args.filter((_, index) => !removedIndexes.includes(index)),
    configPath,
  };
}

function insertConfigArg(args: string[], option: string, configPath: string): string[] {
  // Keep the injected config before `--`; arguments after it must remain positional for the child CLI.
  const terminatorIndex = args.indexOf('--');

  if (terminatorIndex === -1) {
    return [...args, option, configPath];
  }

  return [...args.slice(0, terminatorIndex), option, configPath, ...args.slice(terminatorIndex)];
}

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

async function runRslintCLI(): Promise<void> {
  // TODO
}

export async function setupCommands(): Promise<void> {
  const { args, configPath } = parseCliArgs(process.argv.slice(2));
  setConfigPath(configPath);
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

  if (command === 'lint') {
    await runRslintCLI();
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
