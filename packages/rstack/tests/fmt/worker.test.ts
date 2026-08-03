import { beforeEach, expect, rs, test } from 'rstack/test';
import { formatFile } from '../../src/fmt/worker.ts';

const mocks = rs.hoisted(() => ({
  readFileCalls: [] as string[],
  writeFileCalls: [] as [string, string, unknown][],
}));

rs.mock('atomically', () => ({
  readFile: (path: string) => {
    mocks.readFileCalls.push(path);
    return Promise.resolve('const value=1');
  },
  writeFile: (path: string, data: string, options: unknown) => {
    mocks.writeFileCalls.push([path, data, options]);
    return Promise.resolve();
  },
}));

beforeEach(() => {
  mocks.readFileCalls.length = 0;
  mocks.writeFileCalls.length = 0;
});

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
  ).resolves.toBe('changed');

  expect(mocks.writeFileCalls).toEqual([
    [filePath, 'const value = 1;\n', { encoding: 'utf8', fsync: false }],
  ]);
});

test('infers the parser before formatting', async () => {
  const filePath = '/virtual/example.ts';

  await expect(
    formatFile(
      {
        path: filePath,
        options: { filepath: filePath },
      },
      false,
    ),
  ).resolves.toBe('changed');

  expect(mocks.readFileCalls).toEqual([filePath]);
  expect(mocks.writeFileCalls).toEqual([]);
});

test('skips unsupported files before reading them', async () => {
  const filePath = '/virtual/example.unknown';

  await expect(
    formatFile(
      {
        path: filePath,
        options: { filepath: filePath },
      },
      true,
    ),
  ).resolves.toBe('unsupported');

  expect(mocks.readFileCalls).toEqual([]);
  expect(mocks.writeFileCalls).toEqual([]);
});
