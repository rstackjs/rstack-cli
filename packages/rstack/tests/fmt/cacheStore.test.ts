import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import {
  fmtCacheFileName,
  fmtCacheVersion,
  loadFmtCacheStore,
  type FmtCacheFile,
} from '../../src/fmt/cacheStore.ts';
import { withTempProject } from './helpers.ts';

const namespace = 'test-namespace';
const contentA = 'content-a';
const contentB = 'content-b';
const contentC = 'content-c';
const optionsA = 'options-a';
const optionsB = 'options-b';
const optionsC = 'options-c';
const firstEntry = [contentA, optionsA, 'clean'] as const;
const secondEntry = [contentB, optionsB, 'dirty'] as const;
const unsupportedEntry = ['', optionsC, 'unsupported'] as const;
const hashedUnsupportedEntry = [contentC, optionsC, 'unsupported'] as const;

const readCache = (filePath: string): FmtCacheFile =>
  JSON.parse(readFileSync(filePath, 'utf8')) as FmtCacheFile;

test('writes flat entries that can be loaded by another store', async () => {
  await withTempProject(async (rootPath) => {
    const cachePath = path.join(rootPath, 'cache', fmtCacheFileName);
    const store = await loadFmtCacheStore(cachePath, namespace);

    expect(await store.save()).toBe(false);
    expect(existsSync(cachePath)).toBe(false);

    store.set('src/a.ts', firstEntry);
    store.set('src/unknown.fixture', unsupportedEntry);
    store.set('script', hashedUnsupportedEntry);
    expect(await store.save()).toBe(true);
    expect(await store.save()).toBe(false);
    expect(readCache(cachePath)).toEqual({
      version: fmtCacheVersion,
      namespace,
      options: [optionsA, optionsC],
      files: [
        'src/a.ts',
        contentA,
        0,
        0,
        'src/unknown.fixture',
        '',
        1,
        2,
        'script',
        contentC,
        1,
        2,
      ],
    });

    const loaded = await loadFmtCacheStore(cachePath, namespace);
    expect(loaded.get('src/a.ts')).toEqual(firstEntry);
    expect(loaded.get('src/unknown.fixture')).toEqual(unsupportedEntry);
    expect(loaded.get('script')).toEqual(hashedUnsupportedEntry);
  });
});

test('preserves unvisited entries and skips unchanged updates', async () => {
  await withTempProject(async (rootPath) => {
    const cachePath = path.join(rootPath, fmtCacheFileName);
    writeFileSync(
      cachePath,
      `${JSON.stringify({
        version: fmtCacheVersion,
        namespace,
        options: [optionsA, optionsB],
        files: ['src/a.ts', contentA, 0, 0, 'src/b.ts', contentB, 1, 1],
      })}\n`,
    );

    const store = await loadFmtCacheStore(cachePath, namespace);
    store.set('src/a.ts', secondEntry);
    store.set('src/a.ts', firstEntry);
    expect(await store.save()).toBe(false);

    store.set('src/a.ts', secondEntry);
    expect(await store.save()).toBe(true);
    expect(readCache(cachePath)).toEqual({
      version: fmtCacheVersion,
      namespace,
      options: [optionsB],
      files: ['src/a.ts', contentB, 0, 1, 'src/b.ts', contentB, 0, 1],
    });
  });
});

test('discards invalid schemas and other namespaces', async () => {
  await withTempProject(async (rootPath) => {
    const cachePath = path.join(rootPath, fmtCacheFileName);
    const validCache = {
      version: fmtCacheVersion,
      namespace,
      options: [optionsA],
      files: ['src/a.ts', contentA, 0, 0],
    };
    const invalidContents = [
      '{invalid',
      JSON.stringify({ ...validCache, version: fmtCacheVersion - 1 }),
      JSON.stringify({ version: fmtCacheVersion, namespace, files: [] }),
      JSON.stringify({ ...validCache, files: { 'src/a.ts': firstEntry } }),
      JSON.stringify({ ...validCache, files: ['src/a.ts', contentA, 0] }),
    ];

    for (const content of invalidContents) {
      writeFileSync(cachePath, content);
      const store = await loadFmtCacheStore(cachePath, namespace);
      expect(store.get('src/a.ts')).toBeUndefined();
    }

    writeFileSync(
      cachePath,
      JSON.stringify({
        ...validCache,
        namespace: 'old-namespace',
      }),
    );
    const store = await loadFmtCacheStore(cachePath, namespace);
    expect(store.get('src/a.ts')).toBeUndefined();
    expect(await store.save()).toBe(true);
    expect(readCache(cachePath)).toEqual({
      version: fmtCacheVersion,
      namespace,
      options: [],
      files: [],
    });
  });
});

test('does not throw or leave temporary files when persistence fails', async () => {
  await withTempProject(async (rootPath) => {
    const cachePath = path.join(rootPath, fmtCacheFileName);
    mkdirSync(cachePath);

    const store = await loadFmtCacheStore(cachePath, namespace);
    store.set('src/a.ts', firstEntry);

    await expect(store.save()).resolves.toBe(false);
    expect(readdirSync(rootPath).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
