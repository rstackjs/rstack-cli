import path from 'node:path';
import { performance } from 'node:perf_hooks';
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
  maxWorkers?: number;
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
  --parallel-workers <count>  Number of parallel workers
  -h, --help          Display this help message`;

const parseMaxWorkers = (
  kebabValue: string | undefined,
  camelValue: string | undefined,
): number | undefined => {
  const value = kebabValue ?? camelValue;
  if (value === undefined) {
    return undefined;
  }

  const maxWorkers = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(maxWorkers) || maxWorkers < 1) {
    throw new Error('The --parallel-workers option must be a positive integer.');
  }

  return maxWorkers;
};

const parseFmtCLIArgs = (args: string[]): ParsedFmtCLIArgs => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      write: { type: 'boolean' },
      check: { type: 'boolean' },
      'list-different': { type: 'boolean' },
      listDifferent: { type: 'boolean' },
      'parallel-workers': { type: 'string' },
      parallelWorkers: { type: 'string' },
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
  const maxWorkers = parseMaxWorkers(values['parallel-workers'], values.parallelWorkers);

  return {
    mode,
    patterns: positionals,
    maxWorkers,
    help: values.help ?? false,
  };
};

const getDisplayPath = (cwd: string, filePath: string): string => {
  const relativePath = path.relative(cwd, filePath);
  return path.sep === '\\' ? relativePath.replaceAll('\\', '/') : relativePath;
};

const prettyTime = (seconds: number): string => {
  const format = (time: string, unit: 'm' | 's') => color.bold(`${time}${unit}`);

  if (seconds < 10) {
    const digits = seconds >= 0.01 ? 2 : 3;
    return format(seconds.toFixed(digits), 's');
  }

  if (seconds < 60) {
    return format(seconds.toFixed(1), 's');
  }

  const minutes = Math.floor(seconds / 60);
  const minutesLabel = format(minutes.toFixed(0), 'm');
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return minutesLabel;
  }

  const secondsLabel = format(remainingSeconds.toFixed(remainingSeconds % 1 === 0 ? 0 : 1), 's');

  return `${minutesLabel} ${secondsLabel}`;
};

const formatCount = (count: number): string => color.bold(count);
const formatFileCount = (count: number, isError = false): string => {
  const formattedCount = formatCount(count);
  return `${isError ? color.red(formattedCount) : formattedCount} ${count === 1 ? 'file' : 'files'}`;
};

const logFmtResult = (
  result: FmtRunResult,
  mode: FmtMode,
  cwd: string,
  matchedFileCount: number,
  durationSeconds: number,
): void => {
  let writtenCount = 0;
  let differentCount = 0;

  for (const file of result.files) {
    if (file.status === 'written') {
      writtenCount++;
      continue;
    }

    const displayPath = getDisplayPath(cwd, file.path);
    if (file.status === 'different') {
      differentCount++;
      logger[mode === 'check' ? 'error' : 'log'](displayPath);
    } else if (file.status === 'error') {
      logger.error(`${displayPath}: ${String(file.error)}`);
    }
  }

  if (mode === 'write') {
    if (writtenCount === 0 && result.exitCode !== 0) {
      return;
    }

    const matchedFiles = formatFileCount(matchedFileCount);
    const time = prettyTime(durationSeconds);
    const message =
      writtenCount > 0
        ? `Formatted ${formatCount(writtenCount)} of ${matchedFiles} in ${time}.`
        : `Checked ${matchedFiles} in ${time}. No changes needed.`;
    logger[result.exitCode === 0 ? 'success' : 'info'](message);
    return;
  }

  if (mode !== 'check') {
    return;
  }

  if (differentCount > 0) {
    const differentFiles = formatFileCount(differentCount, true);
    const matchedFiles = formatFileCount(matchedFileCount);
    const checkOption = color.cyan('--check');
    logger.error(
      `Formatting issues found in ${differentFiles}. Run without ${checkOption} to fix.`,
    );
    logger.info(`Checked ${matchedFiles} in ${prettyTime(durationSeconds)}.`);
  } else if (result.exitCode === 0) {
    logger.success(
      `Checked ${formatFileCount(matchedFileCount)} in ${prettyTime(durationSeconds)}. No issues found.`,
    );
  }
};

const runFmtCLI = async (args: string[]): Promise<void> => {
  const { help, maxWorkers, mode, patterns } = parseFmtCLIArgs(args);
  if (help) {
    logger.log(fmtHelpMessage);
    return;
  }

  const cwd = process.cwd();
  const startTime = performance.now();

  try {
    const { configs, filePath } = await loadRstackConfig();
    const config = await resolveFmtConfig({
      definition: configs.fmt,
      configFilePath: filePath,
      cwd,
    });
    const files = await discoverFmtFiles({ cwd, patterns, config });

    if (files.length === 0) {
      if (mode !== 'list-different') {
        logger.info('No files matched.');
      }
      return;
    }

    if (mode === 'check') {
      logger.start('Checking formatting...');
    }

    const result = await runFmtFiles({
      files,
      mode,
      maxWorkers,
    });

    const durationSeconds = (performance.now() - startTime) / 1000;
    logFmtResult(result, mode, cwd, files.length, durationSeconds);
    process.exitCode = result.exitCode;
  } catch (error) {
    logger.error(error);
    process.exitCode = 2;
  }
};

export { fmtHelpMessage, parseFmtCLIArgs, prettyTime, runFmtCLI };
export type { ParsedFmtCLIArgs };
