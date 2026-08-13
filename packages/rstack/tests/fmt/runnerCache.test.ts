import { readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'rstack/test';
import {
  cacheHashLength,
  cacheNamespace,
  createCacheHash,
  createOptionsHasher,
} from '../../src/fmt/cacheIdentity.ts';
import { loadFmtCacheStore } from '../../src/fmt/cacheStore.ts';
import { runFmtFiles } from '../../src/fmt/runner.ts';
import type { FmtCacheContext, FmtFileRequest, FmtMode } from '../../src/fmt/types.ts';
import {
  createFmtCacheContext,
  createFmtRequest,
  withTempProject,
  writeProjectFile,
} from './helpers.ts';

const run = (files: FmtFileRequest[], mode: FmtMode, cache: FmtCacheContext) =>
  runFmtFiles({ files, mode, cache });

for (const mode of ['check', 'list-different'] as const) {
  test(`${mode} persists clean and dirty results`, async () => {
    await withTempProject(async (rootPath) => {
      const cleanPath = path.join(rootPath, 'clean.ts');
      const dirtyPath = path.join(rootPath, 'dirty.ts');
      const cache = createFmtCacheContext(rootPath);
      writeFileSync(cleanPath, 'const clean = 1;\n');
      writeFileSync(dirtyPath, 'const dirty=1');

      const files = [createFmtRequest(cleanPath), createFmtRequest(dirtyPath)];
      const first = await run(files, mode, cache);

      expect(first).toMatchObject({
        exitCode: 1,
        files: [{ path: dirtyPath, status: 'different' }],
        processedFileCount: 2,
      });

      const store = await loadFmtCacheStore(cache.filePath, cacheNamespace);
      expect(store.get('clean.ts')).toEqual([
        createCacheHash(readFileSync(cleanPath)),
        expect.any(String),
        'clean',
      ]);
      expect(store.get('dirty.ts')).toEqual([
        createCacheHash(readFileSync(dirtyPath)),
        expect.any(String),
        'dirty',
      ]);

      await expect(run(files, mode, cache)).resolves.toMatchObject(first);
    });
  });
}

test('uses content hashes instead of file metadata', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = path.join(rootPath, 'index.ts');
    const cache = createFmtCacheContext(rootPath);
    const timestamp = new Date('2020-01-01T00:00:00.000Z');
    const clean = 'const value = 1;\n';
    const dirty = 'const value=  1;\n';
    writeFileSync(filePath, clean);
    utimesSync(filePath, timestamp, timestamp);

    await run([createFmtRequest(filePath)], 'check', cache);
    const firstStore = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    const firstEntry = firstStore.get('index.ts');

    writeFileSync(filePath, dirty);
    utimesSync(filePath, timestamp, timestamp);
    expect(statSync(filePath)).toMatchObject({
      mtimeMs: timestamp.getTime(),
      size: Buffer.byteLength(clean),
    });

    await expect(run([createFmtRequest(filePath)], 'check', cache)).resolves.toMatchObject({
      exitCode: 1,
      files: [{ path: filePath, status: 'different' }],
    });

    const secondStore = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    const secondEntry = secondStore.get('index.ts');
    expect(secondEntry).toEqual([
      createCacheHash(readFileSync(filePath)),
      expect.any(String),
      'dirty',
    ]);
    expect(secondEntry?.[0]).not.toBe(firstEntry?.[0]);
  });
});

test('invalidates entries when final options change', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = path.join(rootPath, 'index.ts');
    const cache = createFmtCacheContext(rootPath);
    writeFileSync(filePath, 'const value = "text";\n');

    const initial = createFmtRequest(filePath, { parser: 'typescript', singleQuote: false });
    await run([initial], 'check', cache);

    const changed = createFmtRequest(filePath, { parser: 'typescript', singleQuote: true });
    await expect(run([changed], 'check', cache)).resolves.toMatchObject({
      exitCode: 1,
      files: [{ path: filePath, status: 'different' }],
    });

    const store = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    expect(store.get('index.ts')).toEqual([
      createCacheHash(readFileSync(filePath)),
      createOptionsHasher()(changed.options),
      'dirty',
    ]);
  });
});

test('caches unsupported parser results until final options change', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = writeProjectFile(rootPath, 'data.unknown', '{"value":true}');
    const cache = createFmtCacheContext(rootPath);
    const unsupported = createFmtRequest(filePath, {});

    const first = await run([unsupported], 'check', cache);
    expect(first).toEqual({
      exitCode: 2,
      files: [],
      processedFileCount: 0,
    });
    expect((await loadFmtCacheStore(cache.filePath, cacheNamespace)).get('data.unknown')).toEqual([
      '',
      createOptionsHasher()(unsupported.options),
      'unsupported',
    ]);

    await expect(run([unsupported], 'check', cache)).resolves.toEqual(first);

    const supported = createFmtRequest(filePath, { parser: 'json' });
    await expect(run([supported], 'check', cache)).resolves.toMatchObject({
      exitCode: 1,
      files: [{ path: filePath, status: 'different' }],
      processedFileCount: 1,
    });
    expect((await loadFmtCacheStore(cache.filePath, cacheNamespace)).get('data.unknown')).toEqual([
      createCacheHash(readFileSync(filePath)),
      createOptionsHasher()(supported.options),
      'dirty',
    ]);
  });
});

test('invalidates cached unsupported parser results when content changes without an extension', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = writeProjectFile(rootPath, 'script', 'plain text\n');
    const cache = createFmtCacheContext(rootPath);
    const file = createFmtRequest(filePath, {});

    const first = await run([file], 'check', cache);
    expect(first).toEqual({
      exitCode: 2,
      files: [],
      processedFileCount: 0,
    });
    expect((await loadFmtCacheStore(cache.filePath, cacheNamespace)).get('script')).toEqual([
      createCacheHash(readFileSync(filePath)),
      createOptionsHasher()(file.options),
      'unsupported',
    ]);

    await expect(run([file], 'check', cache)).resolves.toEqual(first);

    writeFileSync(filePath, '#!/usr/bin/env node\nconst value=1');
    await expect(run([file], 'check', cache)).resolves.toMatchObject({
      exitCode: 1,
      files: [{ path: filePath, status: 'different' }],
      processedFileCount: 1,
    });
    expect((await loadFmtCacheStore(cache.filePath, cacheNamespace)).get('script')).toEqual([
      createCacheHash(readFileSync(filePath)),
      createOptionsHasher()(file.options),
      'dirty',
    ]);
  });
});

test('caches only plugins with stable fingerprints', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = writeProjectFile(rootPath, 'data.fixture', '{"value":true}');
    const pluginEntry = writeProjectFile(
      rootPath,
      'node_modules/prettier-plugin-fixture/index.mjs',
      `export default {
  languages: [{ name: 'Fixture JSON', parsers: ['json'], extensions: ['.fixture'] }],
};
`,
    );
    const packageJsonPath = 'node_modules/prettier-plugin-fixture/package.json';
    const writePackageJson = (version?: string) =>
      writeProjectFile(
        rootPath,
        packageJsonPath,
        JSON.stringify({
          name: 'prettier-plugin-fixture',
          exports: './index.mjs',
          ...(version ? { version } : {}),
        }),
      );
    const cache = createFmtCacheContext(rootPath);
    const file = createFmtRequest(filePath, { plugins: [pathToFileURL(pluginEntry).href] });

    writePackageJson();
    await run([file], 'check', cache);
    expect((await loadFmtCacheStore(cache.filePath, cacheNamespace)).get('data.fixture')).toBe(
      undefined,
    );

    writePackageJson('1.0.0');
    await run([file], 'check', cache);
    const firstHash = (await loadFmtCacheStore(cache.filePath, cacheNamespace)).get(
      'data.fixture',
    )?.[1];
    expect(firstHash).toHaveLength(cacheHashLength);

    writePackageJson('2.0.0');
    await run([file], 'check', cache);
    const secondHash = (await loadFmtCacheStore(cache.filePath, cacheNamespace)).get(
      'data.fixture',
    )?.[1];
    expect(secondHash).toHaveLength(cacheHashLength);
    expect(secondHash).not.toBe(firstHash);
  });
});

test('preserves entries outside the formatted subset', async () => {
  await withTempProject(async (rootPath) => {
    const firstPath = path.join(rootPath, 'first.ts');
    const secondPath = path.join(rootPath, 'second.ts');
    const cache = createFmtCacheContext(rootPath);
    writeFileSync(firstPath, 'const first = 1;\n');
    writeFileSync(secondPath, 'const second = 2;\n');

    await run([createFmtRequest(firstPath), createFmtRequest(secondPath)], 'check', cache);
    const firstStore = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    const secondEntry = firstStore.get('second.ts');

    writeFileSync(firstPath, 'const first=1');
    await run([createFmtRequest(firstPath)], 'check', cache);

    const secondStore = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    expect(secondStore.get('second.ts')).toEqual(secondEntry);
  });
});

test('does not cache formatting errors', async () => {
  await withTempProject(async (rootPath) => {
    const validPath = path.join(rootPath, 'valid.ts');
    const invalidPath = path.join(rootPath, 'invalid.ts');
    const cache = createFmtCacheContext(rootPath);
    writeFileSync(validPath, 'const valid = 1;\n');
    writeFileSync(invalidPath, 'const invalid = ;');

    await run([createFmtRequest(validPath)], 'check', cache);
    await expect(run([createFmtRequest(invalidPath)], 'check', cache)).resolves.toMatchObject({
      exitCode: 2,
      files: [{ path: invalidPath, status: 'error' }],
    });

    const store = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    expect(store.get('valid.ts')).toBeDefined();
    expect(store.get('invalid.ts')).toBeUndefined();
  });
});

test('write persists clean results for misses and hits', async () => {
  await withTempProject(async (rootPath) => {
    const cleanPath = path.join(rootPath, 'clean.ts');
    const dirtyPath = path.join(rootPath, 'dirty.ts');
    const cache = createFmtCacheContext(rootPath);
    writeFileSync(cleanPath, 'const clean = 1;\n');
    writeFileSync(dirtyPath, 'const dirty=1');

    const files = [createFmtRequest(cleanPath), createFmtRequest(dirtyPath)];
    await expect(run(files, 'write', cache)).resolves.toMatchObject({
      exitCode: 0,
      files: [{ path: dirtyPath, status: 'written' }],
      processedFileCount: 2,
    });

    const store = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    expect(store.get('clean.ts')).toEqual([
      createCacheHash(readFileSync(cleanPath)),
      expect.any(String),
      'clean',
    ]);
    expect(store.get('dirty.ts')).toEqual([
      createCacheHash(readFileSync(dirtyPath)),
      expect.any(String),
      'clean',
    ]);

    const timestamps = files.map((file) => statSync(file.path).mtimeMs);
    await expect(run(files, 'write', cache)).resolves.toMatchObject({
      exitCode: 0,
      files: [],
      processedFileCount: 2,
    });
    expect(files.map((file) => statSync(file.path).mtimeMs)).toEqual(timestamps);
  });
});

test('write converts a dirty entry to clean', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = path.join(rootPath, 'index.ts');
    const cache = createFmtCacheContext(rootPath);
    const file = createFmtRequest(filePath);
    writeFileSync(filePath, 'const value=1');

    await run([file], 'check', cache);

    await expect(run([file], 'write', cache)).resolves.toMatchObject({
      exitCode: 0,
      files: [{ path: filePath, status: 'written' }],
    });
    expect(readFileSync(filePath, 'utf8')).toBe('const value = 1;\n');

    const store = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    expect(store.get('index.ts')).toEqual([
      createCacheHash(readFileSync(filePath)),
      expect.any(String),
      'clean',
    ]);
    await expect(run([file], 'check', cache)).resolves.toMatchObject({
      exitCode: 0,
      files: [],
    });
  });
});
