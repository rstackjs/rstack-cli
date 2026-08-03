import { expect, rs, test } from 'rstack/test';
import { runFmtFiles } from '../../src/fmt/runner.ts';

const mocks = rs.hoisted(() => ({
  terminateCalls: 0,
}));

rs.mock('../../src/fmt/parallel.ts', () => ({
  createFmtWorker: () =>
    Promise.resolve({
      formatFile: () => Promise.reject(new Error('atomic write failed')),
      terminate: () => {
        mocks.terminateCalls++;
      },
    }),
}));

test('returns an error when the atomic write fails', async () => {
  const filePath = '/virtual/example.ts';

  const result = await runFmtFiles({
    files: [
      {
        path: filePath,
        options: {
          filepath: filePath,
          parser: 'typescript',
        },
      },
    ],
    mode: 'write',
    cache: false,
  });

  expect(result).toMatchObject({
    exitCode: 2,
    files: [
      {
        path: filePath,
        status: 'error',
        error: { message: 'atomic write failed' },
      },
    ],
  });
  expect(mocks.terminateCalls).toBe(1);
});
