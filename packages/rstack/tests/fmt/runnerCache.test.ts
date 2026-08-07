import { readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'rstack/test';
import { cacheNamespace, createOptionsHasher, sha256 } from '../../src/fmt/cacheIdentity.ts';
import { loadFmtCacheStore } from '../../src/fmt/cacheStore.ts';
import { runFmtFiles } from '../../src/fmt/runner.ts';
import type {
  FmtCacheContext,
  FmtFileRequest,
  FmtMode,
  ResolvedFmtOptions,
} from '../../src/fmt/types.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

const createRequest = (
  filePath: string,
  options: ResolvedFmtOptions = { parser: 'typescript' },
): FmtFileRequest => ({
  path: filePath,
  options,
});

const createCache = (rootPath: string): FmtCacheContext => ({
  filePath: path.join(rootPath, 'cache', 'fmt-v1.json'),
  rootPath,
});

const run = (files: FmtFileRequest[], mode: FmtMode, cache: FmtCacheContext) =>
  runFmtFiles({ files, mode, cache });

for (const mode of ['check', 'list-different'] as const) {
  test(`${mode} persists clean and dirty results`, async () => {
    await withTempProject(async (rootPath) => {
      const cleanPath = path.join(rootPath, 'clean.ts');
      const dirtyPath = path.join(rootPath, 'dirty.ts');
      const cache = createCache(rootPath);
      writeFileSync(cleanPath, 'const clean = 1;\n');
      writeFileSync(dirtyPath, 'const dirty=1');

      const files = [createRequest(cleanPath), createRequest(dirtyPath)];
      const first = await run(files, mode, cache);

      expect(first).toMatchObject({
        exitCode: 1,
        files: [{ path: dirtyPath, status: 'different' }],
        processedFileCount: 2,
      });

      const store = await loadFmtCacheStore(cache.filePath, cacheNamespace);
      expect(store.get('clean.ts')).toEqual([
        sha256(readFileSync(cleanPath)),
        expect.any(String),
        'clean',
      ]);
      expect(store.get('dirty.ts')).toEqual([
        sha256(readFileSync(dirtyPath)),
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
    const cache = createCache(rootPath);
    const timestamp = new Date('2020-01-01T00:00:00.000Z');
    const clean = 'const value = 1;\n';
    const dirty = 'const value=  1;\n';
    writeFileSync(filePath, clean);
    utimesSync(filePath, timestamp, timestamp);

    await run([createRequest(filePath)], 'check', cache);
    const firstStore = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    const firstEntry = firstStore.get('index.ts');

    writeFileSync(filePath, dirty);
    utimesSync(filePath, timestamp, timestamp);
    expect(statSync(filePath)).toMatchObject({
      mtimeMs: timestamp.getTime(),
      size: Buffer.byteLength(clean),
    });

    await expect(run([createRequest(filePath)], 'check', cache)).resolves.toMatchObject({
      exitCode: 1,
      files: [{ path: filePath, status: 'different' }],
    });

    const secondStore = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    const secondEntry = secondStore.get('index.ts');
    expect(secondEntry).toEqual([sha256(readFileSync(filePath)), expect.any(String), 'dirty']);
    expect(secondEntry?.[0]).not.toBe(firstEntry?.[0]);
  });
});

test('invalidates entries when final options change', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = path.join(rootPath, 'index.ts');
    const cache = createCache(rootPath);
    writeFileSync(filePath, 'const value = "text";\n');

    const initial = createRequest(filePath, { parser: 'typescript', singleQuote: false });
    await run([initial], 'check', cache);

    const changed = createRequest(filePath, { parser: 'typescript', singleQuote: true });
    await expect(run([changed], 'check', cache)).resolves.toMatchObject({
      exitCode: 1,
      files: [{ path: filePath, status: 'different' }],
    });

    const store = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    expect(store.get('index.ts')).toEqual([
      sha256(readFileSync(filePath)),
      createOptionsHasher()(changed.options),
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
    const cache = createCache(rootPath);
    const file = createRequest(filePath, { plugins: [pathToFileURL(pluginEntry).href] });

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
    expect(firstHash).toHaveLength(64);

    writePackageJson('2.0.0');
    await run([file], 'check', cache);
    const secondHash = (await loadFmtCacheStore(cache.filePath, cacheNamespace)).get(
      'data.fixture',
    )?.[1];
    expect(secondHash).toHaveLength(64);
    expect(secondHash).not.toBe(firstHash);
  });
});

test('preserves entries outside the formatted subset', async () => {
  await withTempProject(async (rootPath) => {
    const firstPath = path.join(rootPath, 'first.ts');
    const secondPath = path.join(rootPath, 'second.ts');
    const cache = createCache(rootPath);
    writeFileSync(firstPath, 'const first = 1;\n');
    writeFileSync(secondPath, 'const second = 2;\n');

    await run([createRequest(firstPath), createRequest(secondPath)], 'check', cache);
    const firstStore = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    const secondEntry = firstStore.get('second.ts');

    writeFileSync(firstPath, 'const first=1');
    await run([createRequest(firstPath)], 'check', cache);

    const secondStore = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    expect(secondStore.get('second.ts')).toEqual(secondEntry);
  });
});

test('does not cache formatting errors', async () => {
  await withTempProject(async (rootPath) => {
    const validPath = path.join(rootPath, 'valid.ts');
    const invalidPath = path.join(rootPath, 'invalid.ts');
    const cache = createCache(rootPath);
    writeFileSync(validPath, 'const valid = 1;\n');
    writeFileSync(invalidPath, 'const invalid = ;');

    await run([createRequest(validPath)], 'check', cache);
    await expect(run([createRequest(invalidPath)], 'check', cache)).resolves.toMatchObject({
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
    const cache = createCache(rootPath);
    writeFileSync(cleanPath, 'const clean = 1;\n');
    writeFileSync(dirtyPath, 'const dirty=1');

    const files = [createRequest(cleanPath), createRequest(dirtyPath)];
    await expect(run(files, 'write', cache)).resolves.toMatchObject({
      exitCode: 0,
      files: [{ path: dirtyPath, status: 'written' }],
      processedFileCount: 2,
    });

    const store = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    expect(store.get('clean.ts')).toEqual([
      sha256(readFileSync(cleanPath)),
      expect.any(String),
      'clean',
    ]);
    expect(store.get('dirty.ts')).toEqual([
      sha256(readFileSync(dirtyPath)),
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
    const cache = createCache(rootPath);
    const file = createRequest(filePath);
    writeFileSync(filePath, 'const value=1');

    await run([file], 'check', cache);

    await expect(run([file], 'write', cache)).resolves.toMatchObject({
      exitCode: 0,
      files: [{ path: filePath, status: 'written' }],
    });
    expect(readFileSync(filePath, 'utf8')).toBe('const value = 1;\n');

    const store = await loadFmtCacheStore(cache.filePath, cacheNamespace);
    expect(store.get('index.ts')).toEqual([
      sha256(readFileSync(filePath)),
      expect.any(String),
      'clean',
    ]);
    await expect(run([file], 'check', cache)).resolves.toMatchObject({
      exitCode: 0,
      files: [],
    });
  });
});
