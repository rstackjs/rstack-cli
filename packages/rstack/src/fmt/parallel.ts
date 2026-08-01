/**
 * Derived from @prettier/cli v0.12.0.
 * SPDX-License-Identifier: MIT
 * Modified by Rstack contributors.
 */

import { availableParallelism } from 'node:os';
import WorkTank from 'worktank';

type FmtWorkerMethods = typeof import('./worker.ts');

interface FmtWorker {
  formatFile: FmtWorkerMethods['formatFileSerial'];
  terminate: () => void;
}

const getFmtWorkerCount = (fileCount: number): number =>
  Math.min(fileCount, Math.max(1, availableParallelism() - 1));

const getFmtWorkerUrl = (): URL => {
  // Source tests run after build and exercise the same worker artifact as the CLI.
  const workerPath = new URL(import.meta.url).pathname.endsWith('.ts')
    ? '../../dist/fmtWorker.js'
    : './fmtWorker.js';
  return new URL(workerPath, import.meta.url);
};

/** Creates and starts every worker before formatting can begin. */
const createFmtWorker = async (fileCount: number): Promise<FmtWorker> => {
  const workerCount = getFmtWorkerCount(fileCount);
  const pool = new WorkTank<FmtWorkerMethods>({
    pool: {
      name: 'rstack-fmt',
      size: workerCount,
    },
    worker: {
      autoInstantiate: true,
      methods: getFmtWorkerUrl(),
    },
  });

  try {
    // Concurrent handshakes make WorkTank assign one task to every worker.
    await Promise.all(
      Array.from({ length: workerCount }, () => pool.exec('initializeFmtWorker', [])),
    );
  } catch (error) {
    pool.terminate();
    throw error;
  }

  return {
    formatFile: (file, shouldWrite) => pool.exec('formatFileSerial', [file, shouldWrite]),
    terminate: pool.terminate,
  };
};

export { createFmtWorker };
