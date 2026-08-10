import path from 'node:path';
import { beforeEach, expect, rs, test } from 'rstack/test';
import { cacheNamespace, createOptionsHasher } from '../../src/fmt/cacheIdentity.ts';
import { loadFmtCacheStore } from '../../src/fmt/cacheStore.ts';
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

test('does not start the worker pool when every parser result is cached as unsupported', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = writeProjectFile(rootPath, 'example.unknown', 'plain text');
    const cachePath = path.join(rootPath, 'cache', 'fmt-v1.json');
    const file: FmtFileRequest = { path: filePath, options: {} };
    const optionsHash = createOptionsHasher()(file.options);
    if (optionsHash === undefined) {
      throw new Error('Expected cacheable formatter options.');
    }

    const store = await loadFmtCacheStore(cachePath, cacheNamespace);
    store.set('example.unknown', [null, optionsHash, 'unsupported']);
    await expect(store.save()).resolves.toBe(true);

    await expect(
      runFmtFiles({
        files: [file],
        mode: 'check',
        cache: { filePath: cachePath, rootPath },
      }),
    ).resolves.toEqual({
      exitCode: 2,
      files: [],
      processedFileCount: 0,
    });
    expect(mocks.createFmtWorkerPoolCalls).toEqual([]);
  });
});

test('starts the worker pool for a path-only unsupported entry without an extension', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = writeProjectFile(rootPath, 'script', 'plain text');
    const cachePath = path.join(rootPath, 'cache', 'fmt-v1.json');
    const file: FmtFileRequest = { path: filePath, options: {} };
    const optionsHash = createOptionsHasher()(file.options);
    if (optionsHash === undefined) {
      throw new Error('Expected cacheable formatter options.');
    }

    const store = await loadFmtCacheStore(cachePath, cacheNamespace);
    store.set('script', [null, optionsHash, 'unsupported']);
    await expect(store.save()).resolves.toBe(true);

    await expect(
      runFmtFiles({
        files: [file],
        mode: 'check',
        cache: { filePath: cachePath, rootPath },
      }),
    ).rejects.toThrow('worker startup failed');
    expect(mocks.createFmtWorkerPoolCalls).toEqual([[1, undefined]]);
  });
});
