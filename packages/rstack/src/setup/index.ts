import { parseArgs } from 'node:util';
import { color } from 'rslog';
import { installHooks } from './install.ts';

const helpMessage = `Rstack v${RSTACK_VERSION}

${color.cyan('Usage')}:
${color.yellow('  $ rs setup [options]')}

Install Git hooks in the current repository.

${color.cyan('Options')}:
  -h, --help  Display this help message`;

export const runSetupCLI = (args: string[]): void => {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    console.log(helpMessage);
    return;
  }

  const result = installHooks();

  if (result.status === 'installed') {
    console.log('Git hooks installed.');
    return;
  }

  if (result.status === 'unchanged') {
    console.log('Git hooks are already installed.');
    return;
  }

  if (result.status === 'skipped') {
    const reason =
      result.reason === 'disabled' ? 'disabled by RSTACK_HOOKS' : 'not a Git repository';
    console.log(`Git hooks setup skipped: ${reason}.`);
    return;
  }

  throw new Error(result.message);
};
