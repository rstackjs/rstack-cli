// Derived from @prettier/cli, see THIRD_PARTY_NOTICES.md

import { availableParallelism } from 'node:os';
import Tinypool from 'tinypool';
import type { FmtFileRequest } from './types.ts';

type FmtWorkerMethods = typeof import('./worker.ts');

interface FmtWorkerPool {
  formatFile: (
    file: FmtFileRequest,
    shouldWrite: boolean,
  ) => ReturnType<FmtWorkerMethods['formatFile']>;
  terminate: () => Promise<void>;
}

const getFmtWorkerCount = (fileCount: number, maxWorkers?: number): number =>
  Math.min(fileCount, maxWorkers ?? Math.max(1, availableParallelism() - 1));

const getFmtWorkerUrl = (): URL => {
  // Source tests run after build and exercise the same worker artifact as the CLI.
  const workerPath = new URL(import.meta.url).pathname.endsWith('.ts')
    ? '../../dist/fmtWorker.js'
    : './fmtWorker.js';
  return new URL(workerPath, import.meta.url);
};

/** Creates and starts every worker before formatting can begin. */
const createFmtWorkerPool = async (
  fileCount: number,
  maxWorkers?: number,
): Promise<FmtWorkerPool> => {
  const workerCount = getFmtWorkerCount(fileCount, maxWorkers);
  const pool = new Tinypool({
    filename: getFmtWorkerUrl().href,
    name: 'initializeFmtWorker',
    minThreads: workerCount,
    maxThreads: workerCount,
  });

  try {
    await Promise.all(
      Array.from({ length: workerCount }, () =>
        pool.run(undefined, { name: 'initializeFmtWorker' }),
      ),
    );
  } catch (error) {
    await pool.destroy();
    throw error;
  }

  return {
    formatFile: (file, shouldWrite) => pool.run({ file, shouldWrite }, { name: 'formatFile' }),
    terminate: () => pool.destroy(),
  };
};

export { createFmtWorkerPool, getFmtWorkerCount };
export type { FmtWorkerPool };
