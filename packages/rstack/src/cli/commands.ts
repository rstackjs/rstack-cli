import { join } from 'node:path';
import { getConfigState } from '../config.ts';
import { insertConfigArg, parseArgs, parseCliArgs } from './args.ts';
import { hasHelpFlag, renderHelp } from './help.ts';

const renderRootHelp = (): string =>
  renderHelp({
    usage: 'rs [command] [...options]',
    sections: [
      {
        title: 'Commands',
        items: [
          ['dev', 'Run the app dev server'],
          ['build', 'Build the app for production'],
          ['preview', 'Preview the app production build'],
          ['lib', 'Build library'],
          ['doc', 'Serve or build docs'],
          ['fmt, format', 'Format code'],
          ['lint', 'Lint code'],
          ['check', 'Run static checks, including lint and format'],
          ['test', 'Run tests'],
          ['staged', 'Run tasks on staged Git files'],
          ['setup', 'Install Git hooks'],
        ],
      },
      {
        content: `For command-specific options, run:
  $ rs <command> -h`,
        dim: true,
      },
      {
        title: 'Options',
        items: [
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
          ['-v, --version', 'Display version number'],
        ],
      },
    ],
  });

const renderCheckHelp = (): string =>
  renderHelp({
    usage: 'rs check [options]',
    description: 'Run static checks, including lint and format',
    sections: [
      {
        title: 'Options',
        items: [
          ['--type-check', 'Enable TypeScript type checking'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderDevHelp = (): string =>
  renderHelp({
    usage: 'rs dev [options]',
    description: 'Run the app dev server',
    sections: [
      {
        title: 'Options',
        items: [
          ['-o, --open [url]', 'Open the page in browser on startup'],
          ['--port <port>', 'Set the port number for the server'],
          ['--strict-port', 'Exit if the specified port is already in use'],
          ['--host [host]', 'Set the host that the server listens to'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderBuildHelp = (): string =>
  renderHelp({
    usage: 'rs build [options]',
    description: 'Build the app for production',
    sections: [
      {
        title: 'Options',
        items: [
          ['-w, --watch', 'Enable watch mode to automatically rebuild on file changes'],
          ['--dist-path <dir>', 'Set the root directory of output files'],
          ['--source-map', 'Enable source map'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderPreviewHelp = (): string =>
  renderHelp({
    usage: 'rs preview [options]',
    description: 'Preview the app production build',
    sections: [
      {
        title: 'Options',
        items: [
          ['-o, --open [url]', 'Open the page in browser on startup'],
          ['--port <port>', 'Set the port number for the server'],
          ['--strict-port', 'Exit if the specified port is already in use'],
          ['--host [host]', 'Set the host that the server listens to'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

async function runRsbuildCLI(args: string[]): Promise<void> {
  if (hasHelpFlag(args)) {
    switch (args[0]) {
      case 'dev':
        console.log(renderDevHelp());
        return;
      case 'build':
        console.log(renderBuildHelp());
        return;
      case 'preview':
        console.log(renderPreviewHelp());
        return;
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
    console.log(renderCheckHelp());
    return;
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
  const { args, configPath } = parseCliArgs(process.argv.slice(2));
  const command = args[0];

  getConfigState().configPath = configPath;

  if (!command || command === '-h' || command === '--help') {
    console.log(renderRootHelp());
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
    runSetupCLI(args.slice(1));
    return;
  }

  if (command === 'dev' || command === 'build' || command === 'preview') {
    await runRsbuildCLI(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
