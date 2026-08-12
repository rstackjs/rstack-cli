import { join } from 'node:path';
import { getConfigState } from '../config.ts';
import { insertConfigArg, parseArgs, parseCliArgs } from './args.ts';
import { hasHelpFlag, renderHelp } from './help.ts';

const renderRootHelp = (): string =>
  renderHelp({
    usage: 'rs [command] [options]',
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
          ['mcp', 'Start the local Rstack MCP server over stdio'],
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
          ['-c, --config <path>', 'Specify Rstack config file path'],
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

const renderDocHelp = (): string =>
  renderHelp({
    usage: 'rs doc [command] [root] [options]',
    sections: [
      {
        title: 'Commands',
        items: [
          ['[root]', 'Run the docs dev server (default)'],
          ['build [root]', 'Build docs for production'],
          ['preview [root]', 'Preview the docs production build'],
          ['eject [component]', 'Eject a theme component'],
        ],
      },
      {
        content: `For command-specific options, run:
  $ rs doc <command> -h`,
        dim: true,
      },
      {
        title: 'Options',
        items: [
          ['--port <port>', 'Set the port number for the server'],
          ['--host [host]', 'Set the host that the server listens to'],
          ['--base <base>', 'Set the base path and override config.base'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderDocBuildHelp = (): string =>
  renderHelp({
    usage: 'rs doc build [root] [options]',
    description: 'Build docs for production',
    sections: [
      {
        title: 'Options',
        items: [
          ['--base <base>', 'Set the base path and override config.base'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderDocPreviewHelp = (): string =>
  renderHelp({
    usage: 'rs doc preview [root] [options]',
    description: 'Preview the docs production build',
    sections: [
      {
        title: 'Options',
        items: [
          ['--port <port>', 'Set the port number for the server'],
          ['--host [host]', 'Set the host that the server listens to'],
          ['--base <base>', 'Set the base path and override config.base'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderDocEjectHelp = (): string =>
  renderHelp({
    usage: 'rs doc eject [component] [options]',
    description: 'Eject a theme component',
    sections: [
      {
        title: 'Options',
        items: [['-h, --help', 'Display this help message']],
      },
    ],
  });

const renderTestHelp = (): string =>
  renderHelp({
    usage: 'rs test [command] [...filters] [options]',
    sections: [
      {
        title: 'Commands',
        items: [
          ['[...filters]', 'Run tests (default)'],
          ['run [...filters]', 'Run tests once'],
          ['watch [...filters]', 'Run tests in watch mode'],
          ['list [...filters]', 'List matching tests'],
          ['merge-reports [path]', 'Merge blob reports'],
          ['init [project]', 'Initialize Rstest configuration'],
        ],
      },
      {
        content: `For command-specific options, run:
  $ rs test <command> -h`,
        dim: true,
      },
      {
        title: 'Options',
        items: [
          ['-w, --watch', 'Enable watch mode'],
          ['-u, --update', 'Update snapshot files'],
          ['--coverage', 'Enable code coverage'],
          ['--project <name>', 'Filter test projects by name'],
          ['-t, --test-name-pattern <pattern>', 'Run tests with names matching the pattern'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderTestRunHelp = (): string =>
  renderHelp({
    usage: 'rs test run [...filters] [options]',
    description: 'Run tests once',
    sections: [
      {
        title: 'Options',
        items: [
          ['--related', 'Run tests related to source files'],
          ['--changed [commit]', 'Run tests related to changed files'],
          ['--shard <index/count>', 'Split tests into shards'],
          ['-u, --update', 'Update snapshot files'],
          ['--coverage', 'Enable code coverage'],
          ['--project <name>', 'Filter test projects by name'],
          ['-t, --test-name-pattern <pattern>', 'Run tests with names matching the pattern'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderTestWatchHelp = (): string =>
  renderHelp({
    usage: 'rs test watch [...filters] [options]',
    description: 'Run tests in watch mode',
    sections: [
      {
        title: 'Options',
        items: [
          ['-u, --update', 'Update snapshot files'],
          ['--coverage', 'Enable code coverage'],
          ['--project <name>', 'Filter test projects by name'],
          ['-t, --test-name-pattern <pattern>', 'Run tests with names matching the pattern'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderTestListHelp = (): string =>
  renderHelp({
    usage: 'rs test list [...filters] [options]',
    description: 'List matching tests',
    sections: [
      {
        title: 'Options',
        items: [
          ['--related', 'List tests related to source files'],
          ['--changed [commit]', 'List tests related to changed files'],
          ['--files-only', 'List matching test files only'],
          ['--json [path]', 'Print JSON or write it to a file'],
          ['--include-suites', 'Include test suites'],
          ['--print-location', 'Print test locations'],
          ['--summary', 'Print a summary'],
          ['--project <name>', 'Filter test projects by name'],
          ['-t, --test-name-pattern <pattern>', 'List tests with names matching the pattern'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderTestMergeReportsHelp = (): string =>
  renderHelp({
    usage: 'rs test merge-reports [path] [options]',
    description: 'Merge blob reports',
    sections: [
      {
        title: 'Options',
        items: [
          ['--coverage', 'Generate coverage reports'],
          ['--reporters, --reporter <name>', 'Specify test reporters'],
          ['--cleanup', 'Remove blob reports after merging'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderTestInitHelp = (): string =>
  renderHelp({
    usage: 'rs test init [project] [options]',
    description: 'Initialize Rstest configuration',
    sections: [
      {
        title: 'Options',
        items: [
          ['--yes', 'Use default options without prompts'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderLibHelp = (): string =>
  renderHelp({
    usage: 'rs lib [command] [options]',
    sections: [
      {
        title: 'Commands',
        items: [
          ['build', 'Build the library for production (default)'],
          ['inspect', 'Inspect Rslib, Rsbuild, and Rspack configs'],
          ['mf-dev', 'Start Rsbuild dev server for Module Federation'],
        ],
      },
      {
        content: `For command-specific options, run:
  $ rs lib <command> -h`,
        dim: true,
      },
      {
        title: 'Options',
        items: [
          ['-w, --watch', 'Enable watch mode and rebuild on changes'],
          ['--dts', 'Emit declaration files (use --no-dts to disable)'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderLibBuildHelp = (): string =>
  renderHelp({
    usage: 'rs lib build [options]',
    description: 'Build the library for production',
    sections: [
      {
        title: 'Options',
        items: [
          ['-w, --watch', 'Enable watch mode and rebuild on changes'],
          ['--dts', 'Emit declaration files (use --no-dts to disable)'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderLibInspectHelp = (): string =>
  renderHelp({
    usage: 'rs lib inspect [options]',
    description: 'Inspect Rslib, Rsbuild, and Rspack configs',
    sections: [
      {
        title: 'Options',
        items: [
          ['--output <path>', 'Set the output path for inspection results (default: .rsbuild)'],
          ['--verbose', 'Show complete function definitions in output'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderLibMfDevHelp = (): string =>
  renderHelp({
    usage: 'rs lib mf-dev [options]',
    description: 'Start Rsbuild dev server for Module Federation',
    sections: [
      {
        title: 'Options',
        items: [
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderLintHelp = (): string =>
  renderHelp({
    usage: 'rs lint [options] [files...]',
    description: 'Lint code',
    sections: [
      {
        title: 'Options',
        items: [
          ['--fix', 'Automatically fix problems'],
          ['--type-check', 'Enable TypeScript type checking'],
          ['--type-check-only', 'Run only TypeScript type checking'],
          ['--format <format>', 'Set output format (default | jsonline | github | gitlab)'],
          ['--quiet', 'Report errors only'],
          ['--timing [all|N]', 'Print a per-rule timing table (all rules or top N)'],
          ['--max-warnings <count>', 'Set the maximum number of warnings'],
          ['--rule <rule>', 'Override a rule (repeatable)'],
          ['--no-color', 'Disable colored output'],
          ['--force-color', 'Force colored output'],
          ['-c, --config <path>', 'Specify Rstack config file path'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

const renderMcpHelp = (): string =>
  renderHelp({
    usage: 'rs mcp',
    description: 'Start the local Rstack MCP server over stdio',
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
  if (hasHelpFlag(args)) {
    switch (args[0]) {
      case 'run':
        console.log(renderTestRunHelp());
        return;
      case 'watch':
        console.log(renderTestWatchHelp());
        return;
      case 'list':
        console.log(renderTestListHelp());
        return;
      case 'merge-reports':
        console.log(renderTestMergeReportsHelp());
        return;
      case 'init':
        console.log(renderTestInitHelp());
        return;
      default:
        console.log(renderTestHelp());
        return;
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
        console.log(renderLibBuildHelp());
        return;
      case 'inspect':
        console.log(renderLibInspectHelp());
        return;
      case 'mf-dev':
        console.log(renderLibMfDevHelp());
        return;
      default:
        console.log(renderLibHelp());
        return;
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
        console.log(renderDocBuildHelp());
        return;
      case 'preview':
        console.log(renderDocPreviewHelp());
        return;
      case 'eject':
        console.log(renderDocEjectHelp());
        return;
      default:
        console.log(renderDocHelp());
        return;
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
    console.log(renderLintHelp());
    return;
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

async function runMcpCLI(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    console.log(renderMcpHelp());
    return;
  }

  const { runContextMcpServer } = await import('../mcp.ts');
  await runContextMcpServer(process.cwd());
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

  if (command === 'mcp') {
    await runMcpCLI(args.slice(1));
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
