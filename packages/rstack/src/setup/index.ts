import { color, logger } from 'rslog';
import { parseArgs } from '../cli/args.ts';
import { renderHelp } from '../cli/help.ts';
import { installHooks } from './install.ts';

const renderSetupHelp = (): string =>
  renderHelp({
    usage: 'rs setup [options]',
    description: 'Install Git hooks in the current repository.',
    sections: [
      {
        title: 'Options',
        items: [
          ['--hooks-dir <path>', 'Specify hooks directory relative to the Git repository root'],
          ['-h, --help', 'Display this help message'],
        ],
      },
    ],
  });

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

  const hooksDirs = values.hooksDir;
  if (hooksDirs && hooksDirs.length > 1) {
    throw new Error('The --hooks-dir option cannot be specified more than once.');
  }

  const hooksDir = hooksDirs?.[0];

  if (values.help) {
    console.log(renderSetupHelp());
    return;
  }

  const result = installHooks({ hooksDir });

  if (result.status === 'installed' || result.status === 'unchanged') {
    return;
  }

  if (result.status === 'skipped') {
    if (result.message) {
      logger.warn(`Git hooks setup skipped: ${color.yellow(result.message)}.`);
      return;
    }

    const reason =
      result.reason === 'disabled' ? 'disabled by RSTACK_HOOKS' : 'not a Git repository';
    logger.info(`Git hooks setup skipped: ${color.yellow(reason)}.`);
    return;
  }

  throw new Error(result.message);
};
