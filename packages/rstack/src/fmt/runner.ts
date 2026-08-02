import type {
  FmtExitCode,
  FmtFileRequest,
  FmtFileResult,
  FmtRunResult,
  RunFmtFilesOptions,
} from './types.ts';
import { formatFileSerial } from './serial.ts';

/** Formats one file and reports whether its contents differ. */
type FormatFile = (file: FmtFileRequest, shouldWrite: boolean) => Promise<boolean>;

/** Converts a formatter outcome into the shared per-file result. */
const runFmtFile = async (
  file: FmtFileRequest,
  shouldWrite: boolean,
  formatFile: FormatFile,
): Promise<FmtFileResult> => {
  const startTime = performance.now();

  try {
    const changed = await formatFile(file, shouldWrite);

    return {
      path: file.path,
      status: changed ? (shouldWrite ? 'written' : 'different') : 'unchanged',
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

/** Processes files sequentially while preserving input order. */
const runFmtFilesSerial = async (
  files: FmtFileRequest[],
  shouldWrite: boolean,
): Promise<FmtFileResult[]> => {
  const results: FmtFileResult[] = [];

  for (const file of files) {
    results.push(await runFmtFile(file, shouldWrite, formatFileSerial));
  }

  return results;
};

/** Processes files concurrently while preserving input order. */
const runFmtFilesParallel = async (
  files: FmtFileRequest[],
  shouldWrite: boolean,
  maxWorkers?: number,
): Promise<FmtFileResult[]> => {
  const { createFmtWorker } = await import('./parallel.ts');
  const worker = await createFmtWorker(files.length, maxWorkers);

  try {
    return await Promise.all(files.map((file) => runFmtFile(file, shouldWrite, worker.formatFile)));
  } finally {
    worker.terminate();
  }
};

/** Checks whether every request can be cloned for a worker. */
const canRunFmtFilesParallel = (files: FmtFileRequest[]): boolean => {
  try {
    structuredClone(files);
    return true;
  } catch {
    return false;
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
  parallel,
  maxWorkers,
}: RunFmtFilesOptions): Promise<FmtRunResult> => {
  const startTime = performance.now();
  const shouldWrite = mode === 'write';
  const results =
    parallel && files.length > 1 && canRunFmtFilesParallel(files)
      ? await runFmtFilesParallel(files, shouldWrite, maxWorkers)
      : await runFmtFilesSerial(files, shouldWrite);

  return {
    files: results,
    exitCode: getFmtExitCode(results),
    durationMs: performance.now() - startTime,
  };
};

export { runFmtFiles };
