import { beforeEach, expect, rs, test } from 'rstack/test';
import {
  cacheNamespace,
  createOptionsHasher,
} from '../../src/fmt/cacheIdentity.ts';
import { loadFmtCacheStore } from '../../src/fmt/cacheStore.ts';
import { runFmtFiles } from '../../src/fmt/runner.ts';
import {
  createFmtCacheContext,
  createFmtRequest,
  withTempProject,
  writeProjectFile,
} from './helpers.ts';

const mocks = rs.hoisted(() => ({
  workerPoolCalls: [] as [number, number | undefined][],
}));

rs.mock('../../src/fmt/workerPool.ts', () => ({
  createWorkerPool: (fileCount: number, maxWorkers?: number) => {
    mocks.workerPoolCalls.push([fileCount, maxWorkers]);
    return Promise.reject(new Error('worker startup failed'));
  },
}));

beforeEach(() => {
  mocks.workerPoolCalls.length = 0;
});

const createCachedUnsupportedFile = async (
  rootPath: string,
  fileName: string,
) => {
  const filePath = writeProjectFile(rootPath, fileName, 'plain text');
  const cache = createFmtCacheContext(rootPath);
  const file = createFmtRequest(filePath, {});
  const optionsHash = createOptionsHasher()(file.options);
  if (optionsHash === undefined) {
    throw new Error('Expected cacheable formatter options.');
  }

  const store = await loadFmtCacheStore(cache.filePath, cacheNamespace);
  store.set(fileName, ['', optionsHash, 'unsupported']);
  await expect(store.save()).resolves.toBe(true);

  return { cache, file };
};

test('does not start the worker pool when every parser result is cached as unsupported', async () => {
  await withTempProject(async (rootPath) => {
    const { cache, file } = await createCachedUnsupportedFile(
      rootPath,
      'example.unknown',
    );

    await expect(
      runFmtFiles({
        files: [file],
        mode: 'check',
        cache,
      }),
    ).resolves.toEqual({
      exitCode: 2,
      files: [],
      processedFileCount: 0,
    });
    expect(mocks.workerPoolCalls).toEqual([]);
  });
});

test('rechecks a path-only unsupported entry on the main thread', async () => {
  await withTempProject(async (rootPath) => {
    const { cache, file } = await createCachedUnsupportedFile(
      rootPath,
      'script',
    );
    writeProjectFile(rootPath, 'script', '#!/usr/bin/env node\nconst value=1');

    await expect(
      runFmtFiles({
        files: [file],
        mode: 'check',
        cache,
      }),
    ).resolves.toEqual({
      exitCode: 1,
      files: [{ path: file.path, status: 'different' }],
      processedFileCount: 1,
    });
    expect(mocks.workerPoolCalls).toEqual([]);
  });
});
