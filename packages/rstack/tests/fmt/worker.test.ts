import { expect, rs, test } from 'rstack/test';
import { formatFile } from '../../src/fmt/worker.ts';

const mocks = rs.hoisted(() => ({
  writeFileCalls: [] as [string, string, unknown][],
}));

rs.mock('atomically', () => ({
  readFile: () => Promise.resolve('const value=1'),
  writeFile: (path: string, data: string, options: unknown) => {
    mocks.writeFileCalls.push([path, data, options]);
    return Promise.resolve();
  },
}));

test('disables fsync for atomic writes', async () => {
  const filePath = '/virtual/example.ts';

  await expect(
    formatFile(
      {
        path: filePath,
        options: {
          filepath: filePath,
          parser: 'typescript',
        },
      },
      true,
    ),
  ).resolves.toBe(true);

  expect(mocks.writeFileCalls).toEqual([
    [filePath, 'const value = 1;\n', { encoding: 'utf8', fsync: false }],
  ]);
});
