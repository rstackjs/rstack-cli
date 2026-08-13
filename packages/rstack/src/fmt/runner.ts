import { cacheNamespace, createCacheKeyResolver, createOptionsHasher } from './cacheIdentity.ts';
import { loadFmtCacheStore } from './cacheStore.ts';
import type { FmtCacheEntry, FmtCacheStore } from './cacheStore.ts';
import { hasDottedBasename } from './pathHelpers.ts';
import type {
  FmtFileCache,
  FmtExitCode,
  FmtFileRequest,
  FmtFileResult,
  FmtPluginSpecifier,
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

interface FmtFileRunTask {
  file: FmtFileRequest;
  key?: string;
  cache?: FmtFileCache;
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

/** Resolves each distinct plugin once before the synchronous per-file cache path. */
const loadPluginFingerprints = async (
  files: FmtFileRequest[],
): Promise<Map<string, string> | undefined> => {
  const plugins = new Map<string, FmtPluginSpecifier>();
  for (const file of files) {
    try {
      for (const plugin of file.options.plugins ?? []) {
        if (typeof plugin === 'string' || plugin instanceof URL) {
          plugins.set(plugin instanceof URL ? plugin.href : plugin, plugin);
        }
      }
    } catch {
      // Unreadable options cannot be cached by the options hasher.
    }
  }
  if (plugins.size === 0) {
    return undefined;
  }

  const { createFingerprintResolver } = await import(
    /* rspackChunkName: 'fmtPlugins' */
    './plugins.ts'
  );
  const resolveFingerprint = createFingerprintResolver();
  const entries = await Promise.all(
    Array.from(plugins, async ([key, plugin]) => [key, await resolveFingerprint(plugin)] as const),
  );
  const fingerprints = new Map<string, string>();
  for (const [key, fingerprint] of entries) {
    if (fingerprint !== undefined) {
      fingerprints.set(key, fingerprint);
    }
  }
  return fingerprints;
};

/** Resolves the portable cache identity before work is dispatched. */
const createRunTask = (file: FmtFileRequest, cache?: RunCache): FmtFileRunTask => {
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

  return { file, key, cache: fileCache };
};

const isCachedUnsupported = ({ file, cache }: FmtFileRunTask): boolean => {
  if (!cache?.entry) {
    return false;
  }
  return (
    cache.entry[0] === '' &&
    cache.entry[1] === cache.optionsHash &&
    cache.entry[2] === 'unsupported' &&
    hasDottedBasename(file.path)
  );
};

/** Converts a formatter outcome into the shared per-file result. */
const runFmtFile = async (
  task: FmtFileRunTask,
  shouldWrite: boolean,
  formatFile: FormatFile,
): Promise<FmtFileRun> => {
  if (isCachedUnsupported(task)) {
    return { outcome: 'unsupported' };
  }

  const { file, key, cache } = task;
  try {
    const result = await formatFile(file, shouldWrite, cache);
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
const runPriorityTasks = async (
  tasks: FmtFileRunTask[],
  shouldWrite: boolean,
  formatFile: FormatFile,
): Promise<FmtFileRun[]> => {
  const priority: number[] = [];
  const rest: number[] = [];

  for (let index = 0; index < tasks.length; index++) {
    (isMarkdown(tasks[index].file) ? priority : rest).push(index);
  }

  const order = priority.concat(rest);
  const outcomes = await Promise.all(
    order.map((index) => runFmtFile(tasks[index], shouldWrite, formatFile)),
  );
  const results = new Array<FmtFileRun>(tasks.length);
  for (let index = 0; index < order.length; index++) {
    results[order[index]] = outcomes[index];
  }
  return results;
};

/** Processes files in a worker pool while preserving input order. */
const runWithWorkers = async (
  files: FmtFileRequest[],
  shouldWrite: boolean,
  maxWorkers?: number,
  cache?: RunCache,
): Promise<FmtWorkerPoolResult> => {
  const tasks = files.map((file) => createRunTask(file, cache));
  const pendingFileCount = tasks.reduce(
    (count, task) => count + (isCachedUnsupported(task) ? 0 : 1),
    0,
  );
  if (pendingFileCount === 0) {
    return { files: [], processedFileCount: 0 };
  }

  const { createWorkerPool } = await import('./workerPool.ts');
  const workerPool = await createWorkerPool(pendingFileCount, maxWorkers);

  try {
    const results =
      workerPool.workerCount >= minPriorityWorkers
        ? await runPriorityTasks(tasks, shouldWrite, workerPool.formatFile)
        : await Promise.all(
            tasks.map((task) => runFmtFile(task, shouldWrite, workerPool.formatFile)),
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
const getExitCode = (files: FmtFileResult[]): FmtExitCode => {
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
    const [store, fingerprints] = await Promise.all([
      loadFmtCacheStore(cache.filePath, cacheNamespace),
      loadPluginFingerprints(files),
    ]);
    runCache = {
      store,
      resolveKey: createCacheKeyResolver(cache.rootPath),
      hashOptions: createOptionsHasher(fingerprints),
    };
  }

  const result =
    files.length === 0
      ? { files: [], processedFileCount: 0 }
      : await runWithWorkers(files, shouldWrite, maxWorkers, runCache);
  await runCache?.store.save().catch(() => false);

  return {
    ...result,
    exitCode: files.length > 0 && result.processedFileCount === 0 ? 2 : getExitCode(result.files),
  };
};

export { runFmtFiles };
