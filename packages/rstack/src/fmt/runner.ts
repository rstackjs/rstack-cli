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
type FmtFileOutcome = FmtFileResult | 'unchanged' | 'unsupported';

interface FmtWorkerPoolResult {
  files: FmtFileResult[];
  processedFileCount: number;
}

/** Converts a formatter outcome into the shared per-file result. */
const runFmtFile = async (
  file: FmtFileRequest,
  shouldWrite: boolean,
  formatFile: FormatFile,
): Promise<FmtFileOutcome> => {
  try {
    const result = await formatFile(file, shouldWrite);
    if (result === 'unchanged' || result === 'unsupported') {
      return result;
    }

    return {
      path: file.path,
      status: shouldWrite ? 'written' : 'different',
    };
  } catch (error) {
    return {
      path: file.path,
      status: 'error',
      error,
    };
  }
};

/** Processes files in a worker pool while preserving input order. */
const runFmtFilesInWorkerPool = async (
  files: FmtFileRequest[],
  shouldWrite: boolean,
  maxWorkers?: number,
): Promise<FmtWorkerPoolResult> => {
  const { createFmtWorkerPool } = await import('./workerPool.ts');
  const workerPool = await createFmtWorkerPool(files.length, maxWorkers);

  try {
    const results = await Promise.all(
      files.map((file) => runFmtFile(file, shouldWrite, workerPool.formatFile)),
    );
    const processedFiles: FmtFileResult[] = [];
    let processedFileCount = 0;

    for (const result of results) {
      if (result === 'unsupported') {
        continue;
      }

      processedFileCount++;
      if (result !== 'unchanged') {
        processedFiles.push(result);
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
}: RunFmtFilesOptions): Promise<FmtRunResult> => {
  const shouldWrite = mode === 'write';
  const result =
    files.length === 0
      ? { files: [], processedFileCount: 0 }
      : await runFmtFilesInWorkerPool(files, shouldWrite, maxWorkers);

  return {
    ...result,
    exitCode:
      files.length > 0 && result.processedFileCount === 0 ? 2 : getFmtExitCode(result.files),
  };
};

export { runFmtFiles };
