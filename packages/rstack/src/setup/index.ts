import { color, logger } from 'rslog';
import { parseArgs } from '../cli/args.ts';
import { printCommandHelp } from '../cli/help.ts';
import { installHooks } from './install.ts';

export const runHooksCLI = async (
  args: string[],
  command: 'hooks' | 'setup' = 'hooks',
): Promise<void> => {
  const { values } = parseArgs({
    args,
    options: {
      force: { type: 'boolean', short: 'f' },
      help: { type: 'boolean', short: 'h' },
      'hooks-dir': { type: 'string', multiple: true },
    },
    allowPositionals: false,
    strict: true,
  });

  const hooksDirs = values.hooksDir;
  if (hooksDirs && hooksDirs.length > 1) {
    throw new Error(
      'The --hooks-dir option cannot be specified more than once.',
    );
  }

  const hooksDir = hooksDirs?.[0];

  if (values.help) {
    await printCommandHelp(command);
    return;
  }

  const result = installHooks({ force: values.force, hooksDir });

  if (result.status === 'installed') {
    // Explain the result when `--force` preserves an existing hooks setup but makes it inactive.
    if (result.inactiveHooks) {
      const { hooks, path, restore } = result.inactiveHooks;
      const hooksMessage = hooks.length
        ? `: ${color.yellow(hooks.join(', '))}`
        : '';
      logger.info(
        `Rstack now manages Git hooks at "${color.yellow(result.hooksPath)}".`,
      );
      logger.info(
        `Existing hooks in "${color.yellow(path)}" were preserved but will no longer run${hooksMessage}.`,
      );

      if (restore === 'unset') {
        logger.info(`Unset ${color.yellow('core.hooksPath')} to restore them.`);
      } else {
        logger.info(
          `Set ${color.yellow('core.hooksPath')} back to "${color.yellow(path)}" to restore them.`,
        );
      }
    }
    return;
  }

  if (result.status === 'unchanged') {
    return;
  }

  if (result.status === 'skipped') {
    if (result.message) {
      logger.warn(`Git hooks setup skipped: ${color.yellow(result.message)}.`);
      if (
        result.reason === 'existing-git-hooks' ||
        result.reason === 'hooks-path-conflict'
      ) {
        logger.info(
          `To continue, run ${color.yellow('rs hooks --force')}. Existing hook files will be preserved but become inactive.`,
        );
      }
      return;
    }

    const reason =
      result.reason === 'disabled'
        ? 'disabled by RSTACK_HOOKS'
        : 'not a Git repository';
    logger.info(`Git hooks setup skipped: ${color.yellow(reason)}.`);
    return;
  }

  throw new Error(result.message);
};
