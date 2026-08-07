import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fmtCacheFileName = 'v1.json';
const fmtCacheVersion = 1;

type FmtCacheState = 'clean' | 'dirty';
type FmtCacheEntry = readonly [contentHash: string, optionsHash: string, state: FmtCacheState];

interface FmtCacheFile {
  version: typeof fmtCacheVersion;
  namespace: string;
  files: Record<string, FmtCacheEntry>;
}

interface FmtCacheStore {
  get(filePath: string): FmtCacheEntry | undefined;
  set(filePath: string, entry: FmtCacheEntry): void;
  /** Persists changed entries and returns whether the cache file was replaced. */
  save(): Promise<boolean>;
}

const createEmptyCache = (namespace: string): FmtCacheFile => ({
  version: fmtCacheVersion,
  namespace,
  files: Object.create(null) as Record<string, FmtCacheEntry>,
});

const parseCacheEntry = (value: unknown): FmtCacheEntry | undefined => {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    typeof value[0] !== 'string' ||
    typeof value[1] !== 'string' ||
    (value[2] !== 'clean' && value[2] !== 'dirty')
  ) {
    return;
  }

  return [value[0], value[1], value[2]];
};

const parseCacheFile = (content: string): FmtCacheFile | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return;
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('version' in value) ||
    value.version !== fmtCacheVersion ||
    !('namespace' in value) ||
    typeof value.namespace !== 'string' ||
    !('files' in value) ||
    typeof value.files !== 'object' ||
    value.files === null ||
    Array.isArray(value.files)
  ) {
    return;
  }

  const files = Object.create(null) as Record<string, FmtCacheEntry>;
  for (const [filePath, rawEntry] of Object.entries(value.files)) {
    const entry = parseCacheEntry(rawEntry);
    if (!entry) {
      return;
    }
    files[filePath] = entry;
  }

  return {
    version: fmtCacheVersion,
    namespace: value.namespace,
    files,
  };
};

const serializeCache = (cache: FmtCacheFile): string => `${JSON.stringify(cache)}\n`;

const isFileNotFoundError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const getTemporaryPath = (filePath: string): string =>
  path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

class FmtCacheStoreImpl implements FmtCacheStore {
  readonly #filePath: string;
  readonly #cache: FmtCacheFile;
  #savedContent: string | undefined;
  #changed: boolean;

  constructor(
    filePath: string,
    cache: FmtCacheFile,
    savedContent: string | undefined,
    changed: boolean,
  ) {
    this.#filePath = filePath;
    this.#cache = cache;
    this.#savedContent = savedContent;
    this.#changed = changed;
  }

  get(filePath: string): FmtCacheEntry | undefined {
    return this.#cache.files[filePath];
  }

  set(filePath: string, entry: FmtCacheEntry): void {
    const current = this.#cache.files[filePath];
    if (current?.[0] === entry[0] && current[1] === entry[1] && current[2] === entry[2]) {
      return;
    }

    this.#cache.files[filePath] = [entry[0], entry[1], entry[2]];
    this.#changed = true;
  }

  async save(): Promise<boolean> {
    if (!this.#changed) {
      return false;
    }

    const content = serializeCache(this.#cache);
    if (content === this.#savedContent) {
      this.#changed = false;
      return false;
    }

    const temporaryPath = getTemporaryPath(this.#filePath);
    try {
      await mkdir(path.dirname(this.#filePath), { recursive: true });
      await writeFile(temporaryPath, content);
      await rename(temporaryPath, this.#filePath);
      this.#savedContent = content;
      this.#changed = false;
      return true;
    } catch {
      return false;
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

const loadFmtCacheStore = async (filePath: string, namespace: string): Promise<FmtCacheStore> => {
  const emptyCache = createEmptyCache(namespace);

  try {
    const content = await readFile(filePath, 'utf8');
    const cache = parseCacheFile(content);
    if (!cache) {
      return new FmtCacheStoreImpl(filePath, emptyCache, undefined, true);
    }

    return cache.namespace === namespace
      ? new FmtCacheStoreImpl(filePath, cache, content, false)
      : new FmtCacheStoreImpl(filePath, emptyCache, undefined, true);
  } catch (error) {
    const missing = isFileNotFoundError(error);
    return new FmtCacheStoreImpl(filePath, emptyCache, undefined, !missing);
  }
};

export { fmtCacheFileName, fmtCacheVersion, loadFmtCacheStore };
export type { FmtCacheEntry, FmtCacheFile, FmtCacheState, FmtCacheStore };
