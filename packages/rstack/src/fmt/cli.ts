import { parseArgs } from 'node:util';
import { color } from 'rslog';
import type { FmtMode } from './types.ts';

interface ParsedFmtCLIArgs {
  mode: FmtMode;
  patterns: string[];
  help: boolean;
}

const fmtHelpMessage: string = `Rstack v${RSTACK_VERSION}

${color.cyan('Usage')}:
${color.yellow('  $ rs fmt [options] [files/globs...]')}

Format files with Prettier.

${color.cyan('Options')}:
  --write             Write formatted files in place (default)
  --check             Check whether files are formatted
  --list-different    Print paths of unformatted files
  -h, --help          Display this help message`;

const parseFmtCLIArgs = (args: string[]): ParsedFmtCLIArgs => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      write: { type: 'boolean' },
      check: { type: 'boolean' },
      'list-different': { type: 'boolean' },
      listDifferent: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  });

  const listDifferent = values['list-different'] || values.listDifferent;
  const modes = [values.write, values.check, listDifferent].filter(Boolean);
  if (modes.length > 1) {
    throw new Error('The --write, --check, and --list-different options cannot be used together.');
  }

  const mode = values.check ? 'check' : listDifferent ? 'list-different' : 'write';

  return {
    mode,
    patterns: positionals,
    help: values.help ?? false,
  };
};

export { fmtHelpMessage, parseFmtCLIArgs };
export type { ParsedFmtCLIArgs };
