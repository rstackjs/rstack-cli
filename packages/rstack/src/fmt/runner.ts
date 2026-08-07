import { cacheNamespace, createCacheKeyResolver, createOptionsHasher } from './cacheIdentity.ts';
import { loadFmtCacheStore } from './cacheStore.ts';
import type { FmtCacheEntry, FmtCacheStore } from './cacheStore.ts';
import type {
  FmtFileCache,
  FmtExitCode,
  FmtFileRequest,
  FmtFileResult,
  FmtRunResult,
  RunFmtFilesOptions,
} from './types.ts';
import type { FmtWorkerPool } from './workerPool.ts';

/** Formats one file and reports whether its contents differ. */
type FormatFile = FmtWorkerPool['formatFile'];
type FmtFileOutcome = FmtFileResult | 'unchanged' | 'unsupported';

interface FmtFileRun {
  outcome: FmtFileOutcome;
  key?: string;
  entry?: FmtCacheEntry;
}

interface RunCache {
  store: FmtCacheStore;
  resolveKey: ReturnType<typeof createCacheKeyResolver>;
  hashOptions: ReturnType<typeof createOptionsHasher>;
}

interface FmtWorkerPoolResult {
  files: FmtFileResult[];
  processedFileCount: number;
}

/** Benchmarks show stable scheduling gains only when at least eight workers share the queue. */
const minPriorityWorkers = 8;

/**
 * Markdown parsing is consistently slower in representative repositories. Keep this signal
 * narrow: parser overrides and file size can outweigh the extension, and deferring every JS/TS
 * file could turn a large source file into the final straggler.
 */
const isMarkdown = (file: FmtFileRequest): boolean =>
  file.path.endsWith('.md') || file.path.endsWith('.mdx');

/** Converts a formatter outcome into the shared per-file result. */
const runFmtFile = async (
  file: FmtFileRequest,
  shouldWrite: boolean,
  formatFile: FormatFile,
  cache?: RunCache,
): Promise<FmtFileRun> => {
  let key: string | undefined;
  let fileCache: FmtFileCache | undefined;

  if (cache) {
    key = cache.resolveKey(file.path);
    if (key !== undefined) {
      const optionsHash = cache.hashOptions(file.options);
      if (optionsHash === undefined) {
        key = undefined;
      } else {
        fileCache = {
          entry: cache.store.get(key),
          optionsHash,
        };
      }
    }
  }

  try {
    const result = await formatFile(file, shouldWrite, fileCache);
    const outcome: FmtFileOutcome =
      result.status === 'changed'
        ? {
            path: file.path,
            status: shouldWrite ? 'written' : 'different',
          }
        : result.status;

    if (key !== undefined && result.cacheEntry) {
      return { outcome, key, entry: result.cacheEntry };
    }
    return { outcome };
  } catch (error) {
    return {
      outcome: {
        path: file.path,
        status: 'error',
        error,
      },
    };
  }
};

/** Starts slower Markdown parsers first while preserving order within both priority groups. */
const runPriorityFmtFiles = async (
  files: FmtFileRequest[],
  shouldWrite: boolean,
  formatFile: FormatFile,
  cache?: RunCache,
): Promise<FmtFileRun[]> => {
  const priority: number[] = [];
  const rest: number[] = [];

  for (let index = 0; index < files.length; index++) {
    (isMarkdown(files[index]) ? priority : rest).push(index);
  }

  const order = priority.concat(rest);
  const outcomes = await Promise.all(
    order.map((index) => runFmtFile(files[index], shouldWrite, formatFile, cache)),
  );
  const results = new Array<FmtFileRun>(files.length);
  for (let index = 0; index < order.length; index++) {
    results[order[index]] = outcomes[index];
  }
  return results;
};

/** Processes files in a worker pool while preserving input order. */
const runFmtFilesInWorkerPool = async (
  files: FmtFileRequest[],
  shouldWrite: boolean,
  maxWorkers?: number,
  cache?: RunCache,
): Promise<FmtWorkerPoolResult> => {
  const { createFmtWorkerPool } = await import('./workerPool.ts');
  const workerPool = await createFmtWorkerPool(files.length, maxWorkers);

  try {
    const results =
      workerPool.workerCount >= minPriorityWorkers
        ? await runPriorityFmtFiles(files, shouldWrite, workerPool.formatFile, cache)
        : await Promise.all(
            files.map((file) => runFmtFile(file, shouldWrite, workerPool.formatFile, cache)),
          );
    const processedFiles: FmtFileResult[] = [];
    let processedFileCount = 0;

    for (const { outcome, key, entry } of results) {
      if (key !== undefined && entry) {
        cache?.store.set(key, entry);
      }
      if (outcome === 'unsupported') {
        continue;
      }

      processedFileCount++;
      if (outcome !== 'unchanged') {
        processedFiles.push(outcome);
      }
    }

    return { files: processedFiles, processedFileCount };
  } finally {
    await workerPool.terminate();
  }
};

/** Maps file results to the Prettier-compatible CLI exit code. */
const getFmtExitCode = (files: FmtFileResult[]): FmtExitCode => {
  let exitCode: FmtExitCode = 0;

  for (const file of files) {
    if (file.status === 'error') {
      return 2;
    }
    if (file.status === 'different') {
      exitCode = 1;
    }
  }

  return exitCode;
};

/** Runs resolved files and summarizes their outcomes for the CLI. */
const runFmtFiles = async ({
  files,
  mode,
  maxWorkers,
  cache,
}: RunFmtFilesOptions): Promise<FmtRunResult> => {
  const shouldWrite = mode === 'write';
  let runCache: RunCache | undefined;
  if (files.length > 0 && cache) {
    runCache = {
      store: await loadFmtCacheStore(cache.filePath, cacheNamespace),
      resolveKey: createCacheKeyResolver(cache.rootPath),
      hashOptions: createOptionsHasher(),
    };
  }

  const result =
    files.length === 0
      ? { files: [], processedFileCount: 0 }
      : await runFmtFilesInWorkerPool(files, shouldWrite, maxWorkers, runCache);
  await runCache?.store.save().catch(() => false);

  return {
    ...result,
    exitCode:
      files.length > 0 && result.processedFileCount === 0 ? 2 : getFmtExitCode(result.files),
  };
};

export { runFmtFiles };
