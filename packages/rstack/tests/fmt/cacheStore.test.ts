import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { fmtCacheVersion, loadFmtCacheStore, type FmtCacheFile } from '../../src/fmt/cacheStore.ts';
import { withTempProject } from './helpers.ts';

const namespace = 'test-namespace';
const firstEntry = ['content-a', 'options-a', 'clean'] as const;
const secondEntry = ['content-b', 'options-b', 'dirty'] as const;
const unsupportedEntry = [null, 'options-c', 'unsupported'] as const;

const readCache = (filePath: string): FmtCacheFile =>
  JSON.parse(readFileSync(filePath, 'utf8')) as FmtCacheFile;

test('writes entries that can be loaded by another store', async () => {
  await withTempProject(async (rootPath) => {
    const cachePath = path.join(rootPath, 'cache', 'fmt-v1.json');
    const store = await loadFmtCacheStore(cachePath, namespace);

    expect(await store.save()).toBe(false);
    expect(existsSync(cachePath)).toBe(false);

    store.set('src/a.ts', firstEntry);
    store.set('src/unknown.fixture', unsupportedEntry);
    expect(await store.save()).toBe(true);
    expect(await store.save()).toBe(false);

    const loaded = await loadFmtCacheStore(cachePath, namespace);
    expect(loaded.get('src/a.ts')).toEqual(firstEntry);
    expect(loaded.get('src/unknown.fixture')).toEqual(unsupportedEntry);
  });
});

test('preserves unvisited entries and skips unchanged updates', async () => {
  await withTempProject(async (rootPath) => {
    const cachePath = path.join(rootPath, 'fmt-v1.json');
    writeFileSync(
      cachePath,
      `${JSON.stringify({
        version: fmtCacheVersion,
        namespace,
        files: {
          'src/a.ts': firstEntry,
          'src/b.ts': secondEntry,
        },
      })}\n`,
    );

    const store = await loadFmtCacheStore(cachePath, namespace);
    store.set('src/a.ts', secondEntry);
    store.set('src/a.ts', firstEntry);
    expect(await store.save()).toBe(false);

    store.set('src/a.ts', secondEntry);
    expect(await store.save()).toBe(true);
    expect(readCache(cachePath).files).toEqual({
      'src/a.ts': secondEntry,
      'src/b.ts': secondEntry,
    });
  });
});

test('discards invalid data and entries from another namespace', async () => {
  await withTempProject(async (rootPath) => {
    const cachePath = path.join(rootPath, 'fmt-v1.json');
    const invalidContents = [
      '{invalid',
      JSON.stringify({ version: 2, namespace, files: {} }),
      JSON.stringify({
        version: fmtCacheVersion,
        namespace,
        files: { 'src/a.ts': ['content', 'options', 'unknown'] },
      }),
      JSON.stringify({
        version: fmtCacheVersion,
        namespace,
        files: { 'src/a.ts': ['content', 'options', 'unsupported'] },
      }),
      JSON.stringify({
        version: fmtCacheVersion,
        namespace,
        files: { 'src/a.ts': [null, 'options', 'clean'] },
      }),
    ];

    for (const content of invalidContents) {
      writeFileSync(cachePath, content);
      const store = await loadFmtCacheStore(cachePath, namespace);
      expect(store.get('src/a.ts')).toBeUndefined();
    }

    writeFileSync(
      cachePath,
      JSON.stringify({
        version: fmtCacheVersion,
        namespace: 'old-namespace',
        files: { 'src/a.ts': firstEntry },
      }),
    );
    const store = await loadFmtCacheStore(cachePath, namespace);
    expect(store.get('src/a.ts')).toBeUndefined();
    expect(await store.save()).toBe(true);
    expect(readCache(cachePath)).toEqual({
      version: fmtCacheVersion,
      namespace,
      files: {},
    });
  });
});

test('does not throw or leave temporary files when persistence fails', async () => {
  await withTempProject(async (rootPath) => {
    const cachePath = path.join(rootPath, 'fmt-v1.json');
    mkdirSync(cachePath);

    const store = await loadFmtCacheStore(cachePath, namespace);
    store.set('src/a.ts', firstEntry);

    await expect(store.save()).resolves.toBe(false);
    expect(readdirSync(rootPath).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
