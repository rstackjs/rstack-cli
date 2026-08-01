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
const runFmtFiles = async ({ files, mode }: RunFmtFilesOptions): Promise<FmtRunResult> => {
  const startTime = performance.now();
  const results = await runFmtFilesSerial(files, mode === 'write');

  return {
    files: results,
    exitCode: getFmtExitCode(results),
    durationMs: performance.now() - startTime,
  };
};

export { runFmtFiles };
