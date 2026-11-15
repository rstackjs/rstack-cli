import { setImmediate } from 'node:timers/promises';
import { expect, rs, test } from 'rstack/test';
import { runFmtFiles } from '../../src/fmt/runner.ts';
import type { FmtFileRequest } from '../../src/fmt/types.ts';

const state = rs.hoisted(() => ({
  active: 0,
  peak: 0,
  completed: [] as string[],
}));

rs.mock('../../src/fmt/workerPool.ts', () => ({
  createWorkerPool: (_fileCount: number, workerCount: number) => ({
    workerCount,
    async formatFile(file: FmtFileRequest) {
      state.peak = Math.max(state.peak, ++state.active);
      await setImmediate();
      state.active--;
      state.completed.push(file.path);
      return { status: 'unchanged' };
    },
    terminate: () => Promise.resolve(),
  }),
}));

test('bounds in-flight tasks and processes every file', async () => {
  const paths = Array.from({ length: 6 }, (_, index) => `${index}.ts`);

  await runFmtFiles({
    files: paths.map((path) => ({ path, options: {} })),
    mode: 'check',
    maxWorkers: 2,
  });

  expect(state.peak).toBe(2);
  expect(state.completed.sort()).toEqual(paths);
});
