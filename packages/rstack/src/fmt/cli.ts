import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { color, logger } from 'rslog';
import { parseArgs } from '../cli/args.ts';
import { printCommandHelp } from '../cli/help.ts';
import { loadRstackConfig, type LoadedRstackConfig } from '../config.ts';
import { ensureProjectCacheDir } from '../projectCache.ts';
import { fmtCacheFileName } from './cacheStore.ts';
import { resolveFmtConfig } from './config.ts';
import { discoverFmtFiles } from './discovery.ts';
import { formatDuration } from './duration.ts';
import { createRelativePathResolver, toPosixPath } from './pathHelpers.ts';
import { runFmtFiles } from './runner.ts';
import type { FmtMode, FmtRunResult, ResolvedFmtConfig } from './types.ts';

interface ParsedFmtCLIArgs {
  cache: boolean;
  cacheLocation?: string;
  mode: FmtMode;
  patterns: string[];
  ignorePaths: string[];
  ignoreUnknown: boolean;
  noErrorOnUnmatchedPattern: boolean;
  withNodeModules: boolean;
  maxWorkers?: number;
  help: boolean;
  /** Path the stdin content is formatted as; it need not exist on disk. */
  stdinFilepath?: string;
  /** Serve formatting over the Language Server Protocol instead of exiting. */
  lsp: boolean;
}

type RunFmtCLIOptions = {
  /** Option shown to fix issues by rerunning the current command. */
  fixOption?: string;
  /** Rstack config already loaded by the lint phase of `rs check`. */
  loadedConfig?: LoadedRstackConfig;
};

const parseMaxWorkers = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const maxWorkers = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(maxWorkers) ||
    maxWorkers < 1
  ) {
    throw new Error(
      'The --parallel-workers option must be a positive integer.',
    );
  }

  return maxWorkers;
};

/** Rejects the mode flags and file arguments that a server-like option replaces. */
const assertExclusiveMode = (
  option: string,
  hasMode: boolean,
  positionals: string[],
): void => {
  if (hasMode) {
    throw new Error(
      `The ${option} option cannot be used with --write, --check, or --list-different.`,
    );
  }

  if (positionals.length > 0) {
    throw new Error(`The ${option} option cannot be used with file arguments.`);
  }
};

const parseFmtArgs = (args: string[]): ParsedFmtCLIArgs => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      write: { type: 'boolean', short: 'w' },
      check: { type: 'boolean' },
      'list-different': { type: 'boolean', short: 'l' },
      'ignore-path': { type: 'string', multiple: true },
      'ignore-unknown': { type: 'boolean', short: 'u' },
      'no-cache': { type: 'boolean' },
      'cache-location': { type: 'string' },
      'no-error-on-unmatched-pattern': { type: 'boolean' },
      'with-node-modules': { type: 'boolean' },
      'parallel-workers': { type: 'string' },
      'stdin-filepath': { type: 'string' },
      lsp: { type: 'boolean' },
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
    throw new Error(
      'The --write, --check, and --list-different options cannot be used together.',
    );
  }

  const mode = check ? 'check' : listDifferent ? 'list-different' : 'write';
  const cache = !(values.noCache ?? false);
  const cacheLocation = cache ? values.cacheLocation : undefined;
  if (cacheLocation === '') {
    throw new Error('The --cache-location option requires a path.');
  }

  const ignorePaths = values.ignorePath ?? [];
  const ignoreUnknown = values.ignoreUnknown ?? false;
  const noErrorOnUnmatchedPattern = values.noErrorOnUnmatchedPattern ?? false;
  const withNodeModules = values.withNodeModules ?? false;
  const parallelWorkers = values.parallelWorkers;
  const maxWorkers = parseMaxWorkers(parallelWorkers);
  const help = values.help ?? false;
  const stdinFilepath = values.stdinFilepath;
  const lsp = values.lsp ?? false;

  if (lsp) {
    assertExclusiveMode('--lsp', modes.length > 0, positionals);

    if (stdinFilepath !== undefined) {
      throw new Error('The --lsp option cannot be used with --stdin-filepath.');
    }
  }

  if (stdinFilepath !== undefined) {
    assertExclusiveMode('--stdin-filepath', modes.length > 0, positionals);
  }

  return {
    cache,
    cacheLocation,
    mode,
    patterns: positionals,
    ignorePaths,
    ignoreUnknown,
    noErrorOnUnmatchedPattern,
    withNodeModules,
    maxWorkers,
    help,
    stdinFilepath,
    lsp,
  };
};

const createDisplayPathResolver = (
  cwd: string,
): ((filePath: string) => string) => {
  const resolveRelativePath = createRelativePathResolver(cwd);

  return (filePath) => toPosixPath(resolveRelativePath(filePath));
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
  logger.error(
    `No supported files matched ${targets}, or all matching files were ignored.`,
  );
  process.exitCode = 2;
};

const logFmtResult = (
  result: FmtRunResult,
  mode: FmtMode,
  cwd: string,
  processedFileCount: number,
  durationMilliseconds: number,
  fixOption?: string,
): void => {
  let writtenCount = 0;
  let differentCount = 0;
  const resolveDisplayPath = createDisplayPathResolver(cwd);

  for (const file of result.files) {
    if (file.status === 'written') {
      writtenCount++;
      continue;
    }

    const displayPath = resolveDisplayPath(file.path);
    if (file.status === 'different') {
      differentCount++;
      logger[mode === 'check' ? 'error' : 'log'](displayPath);
    } else if (file.status === 'error') {
      logger.error(`${displayPath}: ${String(file.error)}`);
    }
  }

  if (mode === 'list-different') {
    return;
  }

  const time = formatDuration(durationMilliseconds);

  if (mode === 'write') {
    if (writtenCount === 0 && result.exitCode !== 0) {
      return;
    }

    if (result.exitCode === 0) {
      const files = `${processedFileCount} ${processedFileCount === 1 ? 'file' : 'files'}`;
      const details =
        writtenCount > 0
          ? `${files}, ${writtenCount} formatted`
          : `${files}, no changes`;
      logger.success(
        `Formatting completed in ${time} ${color.dim(`(${details})`)}`,
      );
      return;
    }

    const processedFiles = formatFileCount(processedFileCount);
    logger.info(
      `Formatted ${formatCount(writtenCount)} of ${processedFiles} in ${time}.`,
    );
    return;
  }

  if (differentCount > 0) {
    const differentFiles = formatFileCount(differentCount, true);
    const processedFiles = formatFileCount(processedFileCount);
    const fixHint = fixOption
      ? `Rerun this command with ${color.cyan(fixOption)} to fix.`
      : `Rerun this command without ${color.cyan('--check')} to fix.`;
    logger.error(`Formatting issues found in ${differentFiles}. ${fixHint}`);
    logger.info(`Checked ${processedFiles} in ${time}.`);
  } else if (result.exitCode === 0) {
    const files = `${processedFileCount} ${processedFileCount === 1 ? 'file' : 'files'}`;
    logger.success(`Format check passed in ${time} ${color.dim(`(${files})`)}`);
  }
};

const loadFmtConfig = async (
  cwd: string,
  loadedConfig?: LoadedRstackConfig,
): Promise<ResolvedFmtConfig> => {
  const { configs, filePath } =
    loadedConfig ?? (await loadRstackConfig({ cwd }));

  return resolveFmtConfig({
    definition: configs.fmt,
    configFilePath: filePath,
    cwd,
  });
};

const runFmtCLI = async (
  args: string[],
  { fixOption, loadedConfig }: RunFmtCLIOptions = {},
): Promise<void> => {
  const cwd = process.cwd();
  const startTime = performance.now();

  // Argument errors are reported like every other failure so that a single
  // exit code identifies "rs fmt refused to run".
  try {
    const {
      cache,
      cacheLocation,
      help,
      ignorePaths,
      ignoreUnknown,
      lsp,
      maxWorkers,
      mode,
      noErrorOnUnmatchedPattern,
      patterns,
      stdinFilepath,
      withNodeModules,
    } = parseFmtArgs(args);
    if (help) {
      await printCommandHelp('fmt');
      return;
    }

    if (lsp) {
      const { runFmtLsp } = await import(
        /* rspackChunkName: 'fmtLsp' */
        './lsp/server.ts'
      );
      await runFmtLsp({
        // The client's workspace root is not necessarily the directory the
        // editor spawned the server in; the server resolves relative
        // `--ignore-path` values from this cwd so they stay based on the same
        // directory as a relative `--config`.
        cwd,
        ignorePaths,
        loadConfig: loadFmtConfig,
      });
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

    const cacheDirPath = cacheLocation
      ? path.resolve(cwd, cacheLocation)
      : undefined;
    if (cacheDirPath) {
      const cacheDirPrefix = cacheDirPath.endsWith(path.sep)
        ? cacheDirPath
        : `${cacheDirPath}${path.sep}`;
      if (cwd === cacheDirPath || cwd.startsWith(cacheDirPrefix)) {
        throw new Error(
          'The --cache-location directory cannot be the current working directory or an ancestor.',
        );
      }
    }

    const config = await loadFmtConfig(cwd, loadedConfig);
    const files = await discoverFmtFiles({
      cwd,
      patterns,
      config,
      excludedDirPath: cacheDirPath,
      ignorePaths,
      withNodeModules,
    });

    if (files.length === 0) {
      // Staged tasks may pass only paths excluded by formatter ignore rules.
      const allowUnmatched =
        noErrorOnUnmatchedPattern || process.env.RSTACK_STAGED === '1';
      if (allowUnmatched) {
        return;
      }
      reportNoSupportedFiles(patterns);
      return;
    }

    let cacheContext;
    if (cacheDirPath) {
      cacheContext = {
        filePath: path.join(cacheDirPath, fmtCacheFileName),
        rootPath: config.rootPath,
      };
    } else if (cache) {
      const cacheDir = await ensureProjectCacheDir(config.rootPath);
      if (cacheDir.status === 'available') {
        cacheContext = {
          filePath: path.join(cacheDir.path, 'fmt', fmtCacheFileName),
          rootPath: config.rootPath,
        };
      }
    }

    if (mode === 'write') {
      logger.start('Formatting...');
    } else if (mode === 'check') {
      logger.start('Checking formatting...');
    }

    const result = await runFmtFiles({
      files,
      mode,
      maxWorkers,
      cache: cacheContext,
    });

    if (result.processedFileCount === 0) {
      if (ignoreUnknown) {
        if (mode === 'check') {
          logger.success('No supported files to check.');
        } else if (mode === 'write') {
          logger.success('No supported files to format.');
        }
        return;
      }
      reportNoSupportedFiles(patterns);
      return;
    }

    const durationMilliseconds = performance.now() - startTime;
    logFmtResult(
      result,
      mode,
      cwd,
      result.processedFileCount,
      durationMilliseconds,
      fixOption,
    );
    process.exitCode = result.exitCode;
  } catch (error) {
    logger.error(error);
    process.exitCode = 2;
  }
};

export { runFmtCLI };
