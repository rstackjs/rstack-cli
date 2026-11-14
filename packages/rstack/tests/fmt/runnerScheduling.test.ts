import { setImmediate } from 'node:timers/promises';
import { expect, rs, test } from 'rstack/test';
import { runFmtFiles } from '../../src/fmt/runner.ts';
import type { FmtFileRequest } from '../../src/fmt/types.ts';

const state = rs.hoisted(() => ({
  active: 0,
  peak: 0,
  started: [] as string[],
}));

rs.mock('../../src/fmt/workerPool.ts', () => ({
  createWorkerPool: (_fileCount: number, workerCount: number) => ({
    workerCount,
    async formatFile(file: FmtFileRequest) {
      state.started.push(file.path);
      state.peak = Math.max(state.peak, ++state.active);
      await setImmediate();
      // Finish out of order and fail one file without stopping the queue.
      if (file.path === '0.ts') {
        await setImmediate();
      }
      state.active--;
      if (file.path === '1.ts') {
        throw new Error('format failed');
      }
      return { status: 'changed' };
    },
    terminate: () => Promise.resolve(),
  }),
}));

test.each([2, 8])(
  'bounds scheduling to %i workers and preserves result order after failures',
  async (maxWorkers) => {
    state.active = 0;
    state.peak = 0;
    state.started = [];
    const paths = Array.from({ length: 20 }, (_, index) =>
      index === 10 ? '10.md' : index === 15 ? '15.mdx' : `${index}.ts`,
    );

    const result = await runFmtFiles({
      files: paths.map((path) => ({ path, options: {} })),
      mode: 'check',
      maxWorkers,
    });

    expect(state.peak).toBe(maxWorkers);
    expect(state.started).toEqual(
      maxWorkers === 8
        ? ['10.md', '15.mdx', ...paths.filter((path) => path.endsWith('.ts'))]
        : paths,
    );
    expect(result).toEqual({
      exitCode: 2,
      processedFileCount: paths.length,
      files: paths.map((path) =>
        path === '1.ts'
          ? { path, status: 'error', error: new Error('format failed') }
          : { path, status: 'different' },
      ),
    });
  },
);
