import { color } from 'rslog';

declare global {
  const RSTACK_VERSION: string;
}

type HelpItem = readonly [label: string, description: string];

type HelpSection =
  | {
      title: string;
      items: readonly HelpItem[];
    }
  | {
      content: string;
      dim?: boolean;
    };

type HelpDefinition = {
  usage: string;
  description?: string;
  sections?: readonly HelpSection[];
};

export type HelpTopic =
  | 'root'
  | 'check'
  | 'dev'
  | 'build'
  | 'preview'
  | 'doc'
  | 'doc build'
  | 'doc preview'
  | 'doc eject'
  | 'test'
  | 'test run'
  | 'test watch'
  | 'test list'
  | 'test merge-reports'
  | 'test init'
  | 'lib'
  | 'lib build'
  | 'lib inspect'
  | 'lib mf-dev'
  | 'lint'
  | 'fmt'
  | 'staged'
  | 'setup';

const CONFIG_OPTION: HelpItem = [
  '-c, --config <path>',
  'Specify Rstack config file path',
];
const HELP_OPTION: HelpItem = ['-h, --help', 'Display this help message'];
const VERSION_OPTION: HelpItem = ['-v, --version', 'Display version number'];
const CONFIG_HELP_OPTIONS = [CONFIG_OPTION, HELP_OPTION];

const OPEN_OPTION: HelpItem = [
  '-o, --open [url]',
  'Open the page in browser on startup',
];
const PORT_OPTION: HelpItem = [
  '--port <port>',
  'Set the port number for the server',
];
const STRICT_PORT_OPTION: HelpItem = [
  '--strict-port',
  'Exit if the specified port is already in use',
];
const HOST_OPTION: HelpItem = [
  '--host [host]',
  'Set the host that the server listens to',
];
const BASE_OPTION: HelpItem = [
  '--base <base>',
  'Set the base path and override config.base',
];
const SERVER_OPTIONS = [
  OPEN_OPTION,
  PORT_OPTION,
  STRICT_PORT_OPTION,
  HOST_OPTION,
];

const TEST_UPDATE_OPTION: HelpItem = ['-u, --update', 'Update snapshot files'];
const TEST_COVERAGE_OPTION: HelpItem = ['--coverage', 'Enable code coverage'];
const TEST_PROJECT_OPTION: HelpItem = [
  '--project <name>',
  'Filter test projects by name',
];
const TEST_NAME_OPTION: HelpItem = [
  '-t, --test-name-pattern <pattern>',
  'Run tests with names matching the pattern',
];
const TEST_OPTIONS = [
  TEST_UPDATE_OPTION,
  TEST_COVERAGE_OPTION,
  TEST_PROJECT_OPTION,
  TEST_NAME_OPTION,
];

const LIB_WATCH_OPTION: HelpItem = [
  '-w, --watch',
  'Enable watch mode and rebuild on changes',
];
const LIB_DTS_OPTION: HelpItem = [
  '--dts',
  'Emit declaration files (use --no-dts to disable)',
];
const LIB_BUILD_OPTIONS = [LIB_WATCH_OPTION, LIB_DTS_OPTION];

const commandHint = (command: string): HelpSection => ({
  content: `For command-specific options, run:
  $ rs ${command} <command> -h`,
  dim: true,
});

const HELP_DEFINITIONS = {
  root: {
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
        items: [CONFIG_OPTION, HELP_OPTION, VERSION_OPTION],
      },
    ],
  },
  check: {
    usage: 'rs check [options]',
    description: 'Run static checks, including lint and format',
    sections: [
      {
        title: 'Options',
        items: [
          ['--type-check', 'Enable TypeScript type checking'],
          ...CONFIG_HELP_OPTIONS,
        ],
      },
    ],
  },
  dev: {
    usage: 'rs dev [options]',
    description: 'Run the app dev server',
    sections: [
      {
        title: 'Options',
        items: [...SERVER_OPTIONS, ...CONFIG_HELP_OPTIONS],
      },
    ],
  },
  build: {
    usage: 'rs build [options]',
    description: 'Build the app for production',
    sections: [
      {
        title: 'Options',
        items: [
          [
            '-w, --watch',
            'Enable watch mode to automatically rebuild on file changes',
          ],
          ['--dist-path <dir>', 'Set the root directory of output files'],
          ['--source-map', 'Enable source map'],
          ...CONFIG_HELP_OPTIONS,
        ],
      },
    ],
  },
  preview: {
    usage: 'rs preview [options]',
    description: 'Preview the app production build',
    sections: [
      {
        title: 'Options',
        items: [...SERVER_OPTIONS, ...CONFIG_HELP_OPTIONS],
      },
    ],
  },
  doc: {
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
      commandHint('doc'),
      {
        title: 'Options',
        items: [PORT_OPTION, HOST_OPTION, BASE_OPTION, ...CONFIG_HELP_OPTIONS],
      },
    ],
  },
  'doc build': {
    usage: 'rs doc build [root] [options]',
    description: 'Build docs for production',
    sections: [
      {
        title: 'Options',
        items: [BASE_OPTION, ...CONFIG_HELP_OPTIONS],
      },
    ],
  },
  'doc preview': {
    usage: 'rs doc preview [root] [options]',
    description: 'Preview the docs production build',
    sections: [
      {
        title: 'Options',
        items: [PORT_OPTION, HOST_OPTION, BASE_OPTION, ...CONFIG_HELP_OPTIONS],
      },
    ],
  },
  'doc eject': {
    usage: 'rs doc eject [component] [options]',
    description: 'Eject a theme component',
    sections: [
      {
        title: 'Options',
        items: [HELP_OPTION],
      },
    ],
  },
  test: {
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
      commandHint('test'),
      {
        title: 'Options',
        items: [
          ['-w, --watch', 'Enable watch mode'],
          ...TEST_OPTIONS,
          ...CONFIG_HELP_OPTIONS,
        ],
      },
    ],
  },
  'test run': {
    usage: 'rs test run [...filters] [options]',
    description: 'Run tests once',
    sections: [
      {
        title: 'Options',
        items: [
          ['--related', 'Run tests related to source files'],
          ['--changed [commit]', 'Run tests related to changed files'],
          ['--shard <index/count>', 'Split tests into shards'],
          ...TEST_OPTIONS,
          ...CONFIG_HELP_OPTIONS,
        ],
      },
    ],
  },
  'test watch': {
    usage: 'rs test watch [...filters] [options]',
    description: 'Run tests in watch mode',
    sections: [
      {
        title: 'Options',
        items: [...TEST_OPTIONS, ...CONFIG_HELP_OPTIONS],
      },
    ],
  },
  'test list': {
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
          TEST_PROJECT_OPTION,
          [
            '-t, --test-name-pattern <pattern>',
            'List tests with names matching the pattern',
          ],
          ...CONFIG_HELP_OPTIONS,
        ],
      },
    ],
  },
  'test merge-reports': {
    usage: 'rs test merge-reports [path] [options]',
    description: 'Merge blob reports',
    sections: [
      {
        title: 'Options',
        items: [
          ['--coverage', 'Generate coverage reports'],
          ['--reporters, --reporter <name>', 'Specify test reporters'],
          ['--cleanup', 'Remove blob reports after merging'],
          ...CONFIG_HELP_OPTIONS,
        ],
      },
    ],
  },
  'test init': {
    usage: 'rs test init [project] [options]',
    description: 'Initialize Rstest configuration',
    sections: [
      {
        title: 'Options',
        items: [['--yes', 'Use default options without prompts'], HELP_OPTION],
      },
    ],
  },
  lib: {
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
      commandHint('lib'),
      {
        title: 'Options',
        items: [...LIB_BUILD_OPTIONS, ...CONFIG_HELP_OPTIONS],
      },
    ],
  },
  'lib build': {
    usage: 'rs lib build [options]',
    description: 'Build the library for production',
    sections: [
      {
        title: 'Options',
        items: [...LIB_BUILD_OPTIONS, ...CONFIG_HELP_OPTIONS],
      },
    ],
  },
  'lib inspect': {
    usage: 'rs lib inspect [options]',
    description: 'Inspect Rslib, Rsbuild, and Rspack configs',
    sections: [
      {
        title: 'Options',
        items: [
          [
            '--output <path>',
            'Set the output path for inspection results (default: .rsbuild)',
          ],
          ['--verbose', 'Show complete function definitions in output'],
          ...CONFIG_HELP_OPTIONS,
        ],
      },
    ],
  },
  'lib mf-dev': {
    usage: 'rs lib mf-dev [options]',
    description: 'Start Rsbuild dev server for Module Federation',
    sections: [
      {
        title: 'Options',
        items: [...CONFIG_HELP_OPTIONS],
      },
    ],
  },
  lint: {
    usage: 'rs lint [options] [files...]',
    description: 'Lint code',
    sections: [
      {
        title: 'Options',
        items: [
          ['--fix', 'Automatically fix problems'],
          ['--type-check', 'Enable TypeScript type checking'],
          ['--type-check-only', 'Run only TypeScript type checking'],
          [
            '--format <format>',
            'Set output format (default | jsonline | github | gitlab)',
          ],
          ['--quiet', 'Report errors only'],
          [
            '--timing [all|N]',
            'Print a per-rule timing table (all rules or top N)',
          ],
          ['--max-warnings <count>', 'Set the maximum number of warnings'],
          ['--rule <rule>', 'Override a rule (repeatable)'],
          ['--no-color', 'Disable colored output'],
          ['--force-color', 'Force colored output'],
          ...CONFIG_HELP_OPTIONS,
        ],
      },
    ],
  },
  fmt: {
    usage: 'rs fmt [options] [files/globs...]',
    description: 'Format code',
    sections: [
      {
        title: 'Options',
        items: [
          ['-w, --write', 'Write formatted files in place (default)'],
          ['--check', 'Check whether files are formatted'],
          ['-l, --list-different', 'Print paths of unformatted files'],
          [
            '--ignore-path <path>',
            'Path to an additional ignore file (repeatable)',
          ],
          ['-u, --ignore-unknown', 'Ignore unknown files'],
          ['--no-cache', 'Disable the formatting cache'],
          ['--cache-location <path>', 'Path to the formatting cache directory'],
          [
            '--no-error-on-unmatched-pattern',
            'Do not error when no files match',
          ],
          ['--with-node-modules', 'Process files inside node_modules'],
          ['--parallel-workers <count>', 'Number of parallel workers'],
          [
            '--stdin-filepath <path>',
            'Format stdin as if it were saved at <path>',
          ],
          ['--lsp', 'Run a language server on stdio'],
          ...CONFIG_HELP_OPTIONS,
        ],
      },
    ],
  },
  staged: {
    usage: 'rs staged [options]',
    description: 'Run tasks on staged Git files',
    sections: [
      {
        title: 'Options',
        items: [
          [
            '--allow-empty',
            'Allow empty commits when tasks revert all staged changes',
          ],
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
          ...CONFIG_HELP_OPTIONS,
        ],
      },
    ],
  },
  setup: {
    usage: 'rs setup [options]',
    description: 'Install Git hooks in the current repository',
    sections: [
      {
        title: 'Options',
        items: [
          [
            '--hooks-dir <path>',
            'Specify hooks directory relative to the Git repository root',
          ],
          HELP_OPTION,
        ],
      },
    ],
  },
} satisfies Record<HelpTopic, HelpDefinition>;

const renderItems = (items: readonly HelpItem[]): string => {
  const labelWidth = items.reduce(
    (width, [label]) => Math.max(width, label.length),
    0,
  );

  return items
    .map(
      ([label, description]) => `  ${label.padEnd(labelWidth)}  ${description}`,
    )
    .join('\n');
};

const renderSection = (section: HelpSection): string => {
  if ('items' in section) {
    return `${color.cyan(section.title)}:\n${renderItems(section.items)}`;
  }

  return section.dim ? color.dim(section.content) : section.content;
};

const renderHelp = ({
  usage,
  description,
  sections = [],
}: HelpDefinition): string => {
  const blocks = [
    color.bold(`Rstack v${RSTACK_VERSION}`),
    `${color.cyan('Usage')}:\n${color.yellow(`  $ ${usage}`)}`,
  ];

  if (description) {
    blocks.push(description);
  }

  blocks.push(...sections.map(renderSection));

  return blocks.join('\n\n');
};

export const renderCommandHelp = (topic: HelpTopic): string =>
  renderHelp(HELP_DEFINITIONS[topic]);
