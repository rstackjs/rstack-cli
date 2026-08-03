import { readFileSync } from 'node:fs';
import { beforeEach, expect, rs, test } from 'rstack/test';
import { runFmtFiles } from '../../src/fmt/runner.ts';
import type { FmtFileRequest } from '../../src/fmt/types.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

const mocks = rs.hoisted(() => ({
  createFmtWorkerCalls: [] as [number, number | undefined][],
}));

rs.mock('../../src/fmt/parallel.ts', () => ({
  createFmtWorker: (fileCount: number, maxWorkers?: number) => {
    mocks.createFmtWorkerCalls.push([fileCount, maxWorkers]);
    return Promise.reject(new Error('worker startup failed'));
  },
}));

beforeEach(() => {
  mocks.createFmtWorkerCalls.length = 0;
});

const createRequest = (filePath: string): FmtFileRequest => ({
  path: filePath,
  options: {
    filepath: filePath,
    parser: 'typescript',
  },
});

test('starts a worker before formatting a single file', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = writeProjectFile(rootPath, 'index.ts', 'const value=1');

    await expect(
      runFmtFiles({
        files: [createRequest(filePath)],
        mode: 'write',
        cache: false,
        maxWorkers: 1,
      }),
    ).rejects.toThrow('worker startup failed');

    expect(mocks.createFmtWorkerCalls).toEqual([[1, 1]]);
    expect(readFileSync(filePath, 'utf8')).toBe('const value=1');
  });
});

test('does not start a worker when there are no files', async () => {
  await expect(runFmtFiles({ files: [], mode: 'write', cache: false })).resolves.toMatchObject({
    files: [],
    exitCode: 0,
  });
  expect(mocks.createFmtWorkerCalls).toEqual([]);
});
