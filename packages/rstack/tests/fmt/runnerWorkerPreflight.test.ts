import { readFileSync } from 'node:fs';
import { beforeEach, expect, rs, test } from 'rstack/test';
import { runFmtFiles } from '../../src/fmt/runner.ts';
import type { FmtFileRequest } from '../../src/fmt/types.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

const mocks = rs.hoisted(() => ({
  createFmtWorkerPoolCalls: [] as [number, number | undefined][],
}));

rs.mock('../../src/fmt/workerPool.ts', () => ({
  createFmtWorkerPool: (fileCount: number, maxWorkers?: number) => {
    mocks.createFmtWorkerPoolCalls.push([fileCount, maxWorkers]);
    return Promise.reject(new Error('worker startup failed'));
  },
}));

beforeEach(() => {
  mocks.createFmtWorkerPoolCalls.length = 0;
});

const createRequest = (filePath: string): FmtFileRequest => ({
  path: filePath,
  options: {
    parser: 'typescript',
  },
});

test('starts the worker pool before formatting a single file', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = writeProjectFile(rootPath, 'index.ts', 'const value=1');

    await expect(
      runFmtFiles({
        files: [createRequest(filePath)],
        mode: 'write',
        maxWorkers: 1,
      }),
    ).rejects.toThrow('worker startup failed');

    expect(mocks.createFmtWorkerPoolCalls).toEqual([[1, 1]]);
    expect(readFileSync(filePath, 'utf8')).toBe('const value=1');
  });
});

test('does not start the worker pool when there are no files', async () => {
  await expect(runFmtFiles({ files: [], mode: 'write' })).resolves.toMatchObject({
    files: [],
    exitCode: 0,
    processedFileCount: 0,
  });
  expect(mocks.createFmtWorkerPoolCalls).toEqual([]);
});
