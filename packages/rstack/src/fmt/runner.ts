import type {
  FmtExitCode,
  FmtFileRequest,
  FmtFileResult,
  FmtRunResult,
  RunFmtFilesOptions,
} from './types.ts';
import type { FmtWorkerPool } from './workerPool.ts';

/** Formats one file and reports whether its contents differ. */
type FormatFile = FmtWorkerPool['formatFile'];

/** Converts a formatter outcome into the shared per-file result. */
const runFmtFile = async (
  file: FmtFileRequest,
  shouldWrite: boolean,
  formatFile: FormatFile,
): Promise<FmtFileResult | undefined> => {
  const startTime = performance.now();

  try {
    const result = await formatFile(file, shouldWrite);
    if (result === 'unsupported') {
      return;
    }

    return {
      path: file.path,
      status: result === 'changed' ? (shouldWrite ? 'written' : 'different') : 'unchanged',
      durationMs: performance.now() - startTime,
    };
  } catch (error) {
    return {
      path: file.path,
      status: 'error',
      error,
      durationMs: performance.now() - startTime,
    };
  }
};

/** Processes files in a worker pool while preserving input order. */
const runFmtFilesInWorkerPool = async (
  files: FmtFileRequest[],
  shouldWrite: boolean,
  maxWorkers?: number,
): Promise<FmtFileResult[]> => {
  const { createFmtWorkerPool } = await import('./workerPool.ts');
  const workerPool = await createFmtWorkerPool(files.length, maxWorkers);

  try {
    const results = await Promise.all(
      files.map((file) => runFmtFile(file, shouldWrite, workerPool.formatFile)),
    );
    return results.filter((result): result is FmtFileResult => result !== undefined);
  } finally {
    workerPool.terminate();
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
}: RunFmtFilesOptions): Promise<FmtRunResult> => {
  const startTime = performance.now();
  const shouldWrite = mode === 'write';
  const results =
    files.length === 0 ? [] : await runFmtFilesInWorkerPool(files, shouldWrite, maxWorkers);

  return {
    files: results,
    exitCode: getFmtExitCode(results),
    durationMs: performance.now() - startTime,
  };
};

export { runFmtFiles };
