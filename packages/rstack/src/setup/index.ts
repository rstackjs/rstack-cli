import { parseArgs } from 'node:util';
import { color, logger } from 'rslog';
import { installHooks } from './install.ts';

const helpMessage = `Rstack v${RSTACK_VERSION}

${color.cyan('Usage')}:
${color.yellow('  $ rs setup [options]')}

Install Git hooks in the current repository.

${color.cyan('Options')}:
  --hooks-dir <path>  Specify hooks directory relative to the current directory
  -h, --help          Display this help message`;

export const runSetupCLI = (args: string[]): void => {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      'hooks-dir': { type: 'string', multiple: true },
    },
    allowPositionals: false,
    strict: true,
  });

  const hooksDirs = values['hooks-dir'];
  if (hooksDirs && hooksDirs.length > 1) {
    throw new Error('The --hooks-dir option cannot be specified more than once.');
  }

  const hooksDir = hooksDirs?.[0];

  if (values.help) {
    console.log(helpMessage);
    return;
  }

  const result = installHooks({ hooksDir });

  if (result.status === 'installed' || result.status === 'unchanged') {
    return;
  }

  if (result.status === 'skipped') {
    const reason =
      result.reason === 'disabled' ? 'disabled by RSTACK_HOOKS' : 'not a Git repository';
    logger.info(`Git hooks setup skipped: ${color.yellow(reason)}.`);
    return;
  }

  throw new Error(result.message);
};
