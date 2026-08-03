import { expect, rs, test } from 'rstack/test';
import { runFmtFiles } from '../../src/fmt/runner.ts';

const mocks = rs.hoisted(() => ({
  terminateCalls: 0,
}));

rs.mock('../../src/fmt/workerPool.ts', () => ({
  createFmtWorkerPool: () =>
    Promise.resolve({
      formatFile: () => Promise.reject(new Error('file write failed')),
      terminate: () => {
        mocks.terminateCalls++;
      },
    }),
}));

test('returns an error when a file write fails', async () => {
  const filePath = '/virtual/example.ts';

  const result = await runFmtFiles({
    files: [
      {
        path: filePath,
        options: {
          parser: 'typescript',
        },
      },
    ],
    mode: 'write',
  });

  expect(result).toMatchObject({
    exitCode: 2,
    files: [
      {
        path: filePath,
        status: 'error',
        error: { message: 'file write failed' },
      },
    ],
  });
  expect(mocks.terminateCalls).toBe(1);
});
