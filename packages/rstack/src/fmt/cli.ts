import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { color, logger } from 'rslog';
import { parseArgs } from '../cli/args.ts';
import { loadRstackConfig } from '../config.ts';
import { resolveFmtConfig } from './config.ts';
import { discoverFmtFiles } from './discovery.ts';
import { runFmtFiles } from './runner.ts';
import type { FmtMode, FmtRunResult, ResolvedFmtConfig } from './types.ts';

interface ParsedFmtCLIArgs {
  mode: FmtMode;
  patterns: string[];
  ignorePaths: string[];
  ignoreUnknown: boolean;
  noErrorOnUnmatchedPattern: boolean;
  maxWorkers?: number;
  help: boolean;
  /** Path the stdin content is formatted as; it need not exist on disk. */
  stdinFilepath?: string;
}

const fmtHelpMessage: string = `Rstack v${RSTACK_VERSION}

${color.cyan('Usage')}:
${color.yellow('  $ rs fmt [options] [files/globs...]')}

Format files with Prettier.

${color.cyan('Options')}:
  --write                          Write formatted files in place (default)
  --check                          Check whether files are formatted
  --list-different                 Print paths of unformatted files
  --ignore-path <path>             Path to an additional ignore file (repeatable)
  -u, --ignore-unknown             Ignore unknown files
  --no-error-on-unmatched-pattern  Do not error when no files match
  --parallel-workers <count>       Number of parallel workers
  --stdin-filepath <path>          Format stdin as if it were saved at <path>
  -h, --help                       Display this help message`;

const parseMaxWorkers = (value: string | undefined): number | undefined => {
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
      'ignore-path': { type: 'string', multiple: true },
      'ignore-unknown': { type: 'boolean', short: 'u' },
      'no-error-on-unmatched-pattern': { type: 'boolean' },
      'parallel-workers': { type: 'string' },
      'stdin-filepath': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  });

  const write = values.write;
  const check = values.check;
  const listDifferent = values.listDifferent;
  const modes = [write, check, listDifferent].filter(Boolean);
  if (modes.length > 1) {
    throw new Error('The --write, --check, and --list-different options cannot be used together.');
  }

  const mode = check ? 'check' : listDifferent ? 'list-different' : 'write';
  const ignorePaths = values.ignorePath ?? [];
  const ignoreUnknown = values.ignoreUnknown ?? false;
  const noErrorOnUnmatchedPattern = values.noErrorOnUnmatchedPattern ?? false;
  const parallelWorkers = values.parallelWorkers;
  const maxWorkers = parseMaxWorkers(parallelWorkers);
  const help = values.help ?? false;
  const stdinFilepath = values.stdinFilepath;

  if (stdinFilepath !== undefined) {
    if (modes.length > 0) {
      throw new Error(
        'The --stdin-filepath option cannot be used with --write, --check, or --list-different.',
      );
    }

    if (positionals.length > 0) {
      throw new Error('The --stdin-filepath option cannot be used with file arguments.');
    }
  }

  return {
    mode,
    patterns: positionals,
    ignorePaths,
    ignoreUnknown,
    noErrorOnUnmatchedPattern,
    maxWorkers,
    help,
    stdinFilepath,
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

const reportNoSupportedFiles = (patterns: string[]): void => {
  const targets = (patterns.length ? patterns : ['.'])
    .map((pattern) => color.cyan(JSON.stringify(pattern)))
    .join(', ');
  logger.error(`No supported files matched ${targets}, or all matching files were ignored.`);
  process.exitCode = 2;
};

const logFmtResult = (
  result: FmtRunResult,
  mode: FmtMode,
  cwd: string,
  processedFileCount: number,
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

    const processedFiles = formatFileCount(processedFileCount);
    const time = prettyTime(durationSeconds);
    const message =
      writtenCount > 0
        ? `Formatted ${formatCount(writtenCount)} of ${processedFiles} in ${time}.`
        : `Checked ${processedFiles} in ${time}. No changes needed.`;
    logger[result.exitCode === 0 ? 'success' : 'info'](message);
    return;
  }

  if (mode !== 'check') {
    return;
  }

  if (differentCount > 0) {
    const differentFiles = formatFileCount(differentCount, true);
    const processedFiles = formatFileCount(processedFileCount);
    const checkOption = color.cyan('--check');
    logger.error(
      `Formatting issues found in ${differentFiles}. Run without ${checkOption} to fix.`,
    );
    logger.info(`Checked ${processedFiles} in ${prettyTime(durationSeconds)}.`);
  } else if (result.exitCode === 0) {
    logger.success(
      `Checked ${formatFileCount(processedFileCount)} in ${prettyTime(durationSeconds)}. No issues found.`,
    );
  }
};

const loadFmtConfig = async (cwd: string): Promise<ResolvedFmtConfig> => {
  const { configs, filePath } = await loadRstackConfig();

  return resolveFmtConfig({
    definition: configs.fmt,
    configFilePath: filePath,
    cwd,
  });
};

const runFmtCLI = async (args: string[]): Promise<void> => {
  const cwd = process.cwd();
  const startTime = performance.now();

  // Argument errors are reported like every other failure so that a single
  // exit code identifies "rs fmt refused to run".
  try {
    const {
      help,
      ignorePaths,
      ignoreUnknown,
      maxWorkers,
      mode,
      noErrorOnUnmatchedPattern,
      patterns,
      stdinFilepath,
    } = parseFmtCLIArgs(args);
    if (help) {
      logger.log(fmtHelpMessage);
      return;
    }

    if (stdinFilepath !== undefined) {
      const { runFmtStdin } = await import(
        /* rspackChunkName: 'fmtStdin' */
        './stdin.ts'
      );
      await runFmtStdin({
        filepath: stdinFilepath,
        cwd,
        ignorePaths,
        ignoreUnknown,
        loadConfig: () => loadFmtConfig(cwd),
      });
      return;
    }

    const config = await loadFmtConfig(cwd);
    const files = await discoverFmtFiles({
      cwd,
      patterns,
      config,
      ignorePaths,
    });

    if (files.length === 0) {
      // Staged tasks may pass only paths excluded by formatter ignore rules.
      const allowUnmatched = noErrorOnUnmatchedPattern || process.env.RSTACK_STAGED === '1';
      if (allowUnmatched) {
        return;
      }
      reportNoSupportedFiles(patterns);
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

    if (result.processedFileCount === 0) {
      if (ignoreUnknown) {
        if (mode === 'check') {
          logger.success('No supported files to check.');
        }
        return;
      }
      reportNoSupportedFiles(patterns);
      return;
    }

    const durationSeconds = (performance.now() - startTime) / 1000;
    logFmtResult(result, mode, cwd, result.processedFileCount, durationSeconds);
    process.exitCode = result.exitCode;
  } catch (error) {
    logger.error(error);
    process.exitCode = 2;
  }
};

export { fmtHelpMessage, parseFmtCLIArgs, prettyTime, runFmtCLI };
export type { ParsedFmtCLIArgs };
