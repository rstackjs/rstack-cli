// Derived from @prettier/cli, see THIRD_PARTY_NOTICES.md

import { availableParallelism } from 'node:os';
import Tinypool from 'tinypool';
import type { FmtFileCache, FmtFileRequest } from './types.ts';

type FmtWorkerMethods = typeof import('./worker.ts');

interface FmtWorkerPool {
  readonly workerCount: number;
  formatFile: (
    file: FmtFileRequest,
    shouldWrite: boolean,
    cache?: FmtFileCache,
  ) => ReturnType<FmtWorkerMethods['formatFile']>;
  terminate: () => Promise<void>;
}

/**
 * Caps the default worker count at 8 because formatter throughput can
 * plateau before all CPU cores are occupied, while additional workers increase
 * scheduling and memory pressure.
 */
const getWorkerCount = (fileCount: number, maxWorkers?: number): number =>
  Math.min(fileCount, maxWorkers ?? Math.min(8, Math.max(1, availableParallelism() - 1)));

const getWorkerUrl = (): URL => {
  // Source tests run after build and exercise the same worker artifact as the CLI.
  const workerPath = new URL(import.meta.url).pathname.endsWith('.ts')
    ? '../../dist/fmtWorker.js'
    : './fmtWorker.js';
  return new URL(/* rspackIgnore: true */ workerPath, import.meta.url);
};

/** Creates and starts every worker before formatting can begin. */
const createWorkerPool = async (fileCount: number, maxWorkers?: number): Promise<FmtWorkerPool> => {
  const workerCount = getWorkerCount(fileCount, maxWorkers);
  const pool = new Tinypool({
    filename: getWorkerUrl().href,
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
    workerCount,
    formatFile: (file, shouldWrite, cache) =>
      pool.run({ file, shouldWrite, cache }, { name: 'formatFile' }),
    terminate: () => pool.destroy(),
  };
};

export { createWorkerPool };
export type { FmtWorkerPool };
