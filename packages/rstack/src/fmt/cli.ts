import path from 'node:path';
import { parseArgs } from 'node:util';
import { color, logger } from 'rslog';
import { loadRstackConfig } from '../config.ts';
import { resolveFmtConfig } from './config.ts';
import { discoverFmtFiles } from './discovery.ts';
import { runFmtFiles } from './runner.ts';
import type { FmtMode, FmtRunResult } from './types.ts';

interface ParsedFmtCLIArgs {
  mode: FmtMode;
  patterns: string[];
  parallel: boolean;
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
  --no-parallel       Disable worker parallelism
  -h, --help          Display this help message`;

const parseFmtCLIArgs = (args: string[]): ParsedFmtCLIArgs => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      write: { type: 'boolean' },
      check: { type: 'boolean' },
      'list-different': { type: 'boolean' },
      listDifferent: { type: 'boolean' },
      'no-parallel': { type: 'boolean' },
      noParallel: { type: 'boolean' },
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
    parallel: !(values['no-parallel'] || values.noParallel),
    help: values.help ?? false,
  };
};

const getDisplayPath = (cwd: string, filePath: string): string => {
  const relativePath = path.relative(cwd, filePath);
  return path.sep === '\\' ? relativePath.replaceAll('\\', '/') : relativePath;
};

const logFmtResult = (result: FmtRunResult, mode: FmtMode, cwd: string): void => {
  let differentCount = 0;
  let errorCount = 0;

  for (const file of result.files) {
    const displayPath = getDisplayPath(cwd, file.path);

    if (file.status === 'written') {
      logger.log(displayPath);
    } else if (file.status === 'different') {
      differentCount++;
      logger[mode === 'check' ? 'warn' : 'log'](displayPath);
    } else if (file.status === 'error') {
      errorCount++;
      logger.error(`${displayPath}: ${String(file.error)}`);
    }
  }

  if (mode !== 'check') {
    return;
  }

  if (differentCount > 0) {
    const files = differentCount === 1 ? 'file' : 'files';
    logger.warn(
      `Code style issues found in ${differentCount} ${files}. Run rs fmt --write to fix.`,
    );
  } else if (errorCount === 0) {
    logger.log('All matched files use Prettier code style!');
  }
};

const runFmtCLI = async (args: string[]): Promise<void> => {
  const { help, mode, parallel, patterns } = parseFmtCLIArgs(args);
  if (help) {
    console.log(fmtHelpMessage);
    return;
  }

  const cwd = process.cwd();

  try {
    const { configs, filePath } = await loadRstackConfig();
    const config = await resolveFmtConfig({
      definition: configs.fmt,
      configFilePath: filePath,
      cwd,
    });
    const files = await discoverFmtFiles({ cwd, patterns, config });

    if (mode === 'check') {
      logger.log('Checking formatting...');
    }

    const result = await runFmtFiles({
      files,
      mode,
      cache: false,
      parallel,
    });

    logFmtResult(result, mode, cwd);
    process.exitCode = result.exitCode;
  } catch (error) {
    logger.error(error);
    process.exitCode = 2;
  }
};

export { fmtHelpMessage, parseFmtCLIArgs, runFmtCLI };
export type { ParsedFmtCLIArgs };
