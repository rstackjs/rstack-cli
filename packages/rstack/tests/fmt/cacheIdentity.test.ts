import path from 'node:path';
import { pathToFileURL } from 'node:url';
import prettierPkgJson from 'prettier/package.json' with { type: 'json' };
import { expect, test } from 'rstack/test';
import pkgJson from '../../package.json' with { type: 'json' };
import { cacheHashLength, createCacheHash } from '../../src/fmt/cacheHash.ts';
import {
  cacheNamespace,
  createCacheKeyResolver,
  createOptionsHasher,
} from '../../src/fmt/cacheIdentity.ts';
import { fmtCacheVersion } from '../../src/fmt/cacheStore.ts';
import type { ResolvedFmtOptions } from '../../src/fmt/types.ts';

const rootPath = path.join(import.meta.dirname, 'project');

const asOptions = (value: Record<string, unknown>): ResolvedFmtOptions =>
  value as ResolvedFmtOptions;

test('creates stable SHA-256-derived option hashes', () => {
  const hashOptions = createOptionsHasher();
  const left: ResolvedFmtOptions = {
    singleQuote: true,
    semi: false,
  };
  const right: ResolvedFmtOptions = {
    semi: false,
    singleQuote: true,
  };

  expect(hashOptions(left)).toBe(hashOptions(right));
  expect(hashOptions(left)).toHaveLength(cacheHashLength);
  expect(createCacheHash('abc')).toBe('ungWv48Bz-pBQUDe');
});

test('invalidates hashes when final formatter options change', () => {
  const hashOptions = createOptionsHasher();
  const hashes = [
    hashOptions({ singleQuote: false }),
    hashOptions({ singleQuote: true }),
    hashOptions({ parser: 'typescript' }),
    hashOptions({ sortPackageJson: true }),
    hashOptions({ singleQuote: true, semi: false }),
  ];

  expect(hashes.every(Boolean)).toBe(true);
  expect(new Set(hashes).size).toBe(hashes.length);
});

test('includes plugin fingerprints in option hashes', () => {
  const plugin = pathToFileURL(path.resolve('plugin.mjs')).href;
  const first = createOptionsHasher(new Map([[plugin, 'plugin@1']]));
  const second = createOptionsHasher(new Map([[plugin, 'plugin@2']]));

  expect(first({ plugins: [plugin] })).toHaveLength(cacheHashLength);
  expect(first({ plugins: [new URL(plugin)] })).toBe(first({ plugins: [plugin] }));
  expect(first({ plugins: [plugin] })).not.toBe(second({ plugins: [plugin] }));
});

test('bypasses user plugins and unserializable options', () => {
  const hashOptions = createOptionsHasher();
  const cyclic: Record<string, unknown> = {};
  const unreadable = new Proxy(
    {},
    {
      get: () => {
        throw new Error('unreadable');
      },
    },
  );
  cyclic.self = cyclic;

  expect(hashOptions({ plugins: [path.resolve('plugin.mjs')] })).toBeUndefined();
  expect(hashOptions({ plugins: [pathToFileURL(path.resolve('plugin.mjs'))] })).toBeUndefined();

  expect(hashOptions(asOptions({ custom: cyclic }))).toBeUndefined();
  expect(hashOptions(asOptions(unreadable))).toBeUndefined();
});

test('includes formatter implementation versions in the namespace', () => {
  expect(JSON.parse(cacheNamespace)).toEqual([
    fmtCacheVersion,
    pkgJson.version,
    prettierPkgJson.version,
  ]);
});

test('creates config-root-relative POSIX cache keys', () => {
  const resolveKey = createCacheKeyResolver(rootPath);
  const firstPath = path.join(rootPath, 'src/nested/index.ts');
  const secondPath = path.join(rootPath, 'src/other.ts');

  expect(resolveKey(firstPath)).toBe('src/nested/index.ts');
  expect(resolveKey(secondPath)).toBe('src/other.ts');
  expect(resolveKey(firstPath)).not.toBe(resolveKey(secondPath));
  expect(resolveKey(path.join(rootPath, '../shared/index.ts'))).toBe('../shared/index.ts');
});
