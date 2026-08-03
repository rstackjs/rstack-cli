import { expect, test } from 'rstack/test';
import { getFmtWorkerCount } from '../../src/fmt/workerPool.ts';

test.each([
  [4, 1, 1],
  [4, 2, 2],
  [2, 4, 2],
  [12, 10, 10],
])('uses %s files and %s configured workers as %s workers', (files, workers, expected) => {
  expect(getFmtWorkerCount(files, workers)).toBe(expected);
});
