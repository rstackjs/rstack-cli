import type { FmtExitCode, FmtFileResult, FmtRunResult, RunFmtFilesOptions } from './types.ts';
import { formatFileSerial } from './serial.ts';

const runFmtFiles = async ({ files, mode }: RunFmtFilesOptions): Promise<FmtRunResult> => {
  const startTime = performance.now();
  const shouldWrite = mode === 'write';
  const results: FmtFileResult[] = [];
  let exitCode: FmtExitCode = 0;

  for (const file of files) {
    const fileStartTime = performance.now();

    try {
      const changed = await formatFileSerial(file, shouldWrite);

      if (changed && !shouldWrite && exitCode === 0) {
        exitCode = 1;
      }

      results.push({
        path: file.path,
        status: changed ? (shouldWrite ? 'written' : 'different') : 'unchanged',
        durationMs: performance.now() - fileStartTime,
      });
    } catch (error) {
      exitCode = 2;
      results.push({
        path: file.path,
        status: 'error',
        error,
        durationMs: performance.now() - fileStartTime,
      });
    }
  }

  return {
    files: results,
    exitCode,
    durationMs: performance.now() - startTime,
  };
};

export { runFmtFiles };
