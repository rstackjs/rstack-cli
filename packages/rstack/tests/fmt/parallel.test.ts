import { availableParallelism } from 'node:os';
import { expect, test } from 'rstack/test';
import { getFmtWorkerCount } from '../../src/fmt/parallel.ts';

test('uses one fewer worker than the available parallelism by default', () => {
  const defaultWorkerCount = Math.max(1, availableParallelism() - 1);

  expect(getFmtWorkerCount(defaultWorkerCount + 1)).toBe(defaultWorkerCount);
});

test.each([
  [4, 1, 1],
  [4, 2, 2],
  [2, 4, 2],
])('uses %s files and %s configured workers as %s workers', (files, workers, expected) => {
  expect(getFmtWorkerCount(files, workers)).toBe(expected);
});
