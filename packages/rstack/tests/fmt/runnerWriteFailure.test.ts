import { expect, rs, test } from 'rstack/test';
import { runFmtFiles } from '../../src/fmt/runner.ts';

rs.mock('atomically', () => ({
  readFile: () => Promise.resolve('const value=1'),
  writeFile: () => Promise.reject(new Error('atomic write failed')),
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
    parallel: false,
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
});
