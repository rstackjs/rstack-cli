import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import stableStringify from 'fast-json-stable-stringify';
import { fmtCacheVersion } from './cacheStore.ts';
import { createRelativePathResolver, toPosixPath } from './pathHelpers.ts';
import type { ResolvedFmtOptions } from './types.ts';

declare const PRETTIER_VERSION: string;
declare const RSTACK_VERSION: string;

type CacheKeyResolver = (filePath: string) => string | undefined;
type OptionsHasher = (options: ResolvedFmtOptions) => string | undefined;

const sha256 = (content: string | Uint8Array): string =>
  createHash('sha256').update(content).digest('hex');

/** Identifies formatter behavior shared by all cache entries in this process. */
const cacheNamespace: string = JSON.stringify([fmtCacheVersion, RSTACK_VERSION, PRETTIER_VERSION]);

/** Creates project-relative POSIX cache keys without repeating path setup. */
const createCacheKeyResolver = (rootPath: string): CacheKeyResolver => {
  const resolveRelativePath = createRelativePathResolver(rootPath);

  return (filePath) => {
    const relativePath = resolveRelativePath(filePath);
    return isAbsolute(relativePath) ? undefined : toPosixPath(relativePath);
  };
};

/** Hashes final per-file options and memoizes option objects shared by many files. */
const createOptionsHasher = (): OptionsHasher => {
  const hashes = new WeakMap<ResolvedFmtOptions, string | null>();

  return (options) => {
    const cached = hashes.get(options);
    if (cached !== undefined) {
      return cached ?? undefined;
    }

    let hash: string | undefined;
    try {
      // A resolved plugin path does not identify the plugin implementation.
      if (!options.plugins?.length) {
        hash = sha256(stableStringify(options));
      }
    } catch {
      // Circular or unreadable options cannot be cached.
    }

    hashes.set(options, hash ?? null);
    return hash;
  };
};

export { cacheNamespace, createCacheKeyResolver, createOptionsHasher, sha256 };
