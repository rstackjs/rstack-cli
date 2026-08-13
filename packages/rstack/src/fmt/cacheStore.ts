import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const fmtCacheFileName = 'cache.json';
const fmtCacheVersion = 2;

const fileEntryWidth = 4;
const contentHashOffset = 1;
const optionsIndexOffset = 2;
const stateOffset = 3;

const fmtCacheStates = ['clean', 'dirty', 'unsupported'] as const;
type FmtCacheState = (typeof fmtCacheStates)[number];
type FmtCacheStateId = 0 | 1 | 2;

const fmtCacheStateIds = {
  clean: 0,
  dirty: 1,
  unsupported: 2,
} as const satisfies Record<FmtCacheState, FmtCacheStateId>;

type FmtCacheFileValue = string | number;
type FmtCacheEntry = readonly [contentHash: string, optionsHash: string, state: FmtCacheState];

interface FmtCacheFile {
  version: typeof fmtCacheVersion;
  namespace: string;
  options: string[];
  /** Repeated tuples of file path, content hash, options index, and numeric state. */
  files: FmtCacheFileValue[];
}

interface ParsedFmtCacheFile {
  cache: FmtCacheFile;
  fileOffsets: Map<string, number>;
  optionsIndexes: Map<string, number>;
  optionsUseCounts: number[];
}

interface FmtCacheStore {
  get(filePath: string): FmtCacheEntry | undefined;
  set(filePath: string, entry: FmtCacheEntry): void;
  /** Persists changed entries and returns whether the cache file was replaced. */
  save(): Promise<boolean>;
}

const createEmptyCache = (namespace: string): ParsedFmtCacheFile => ({
  cache: {
    version: fmtCacheVersion,
    namespace,
    options: [],
    files: [],
  },
  fileOffsets: new Map(),
  optionsIndexes: new Map(),
  optionsUseCounts: [],
});

const parseCacheFile = (
  content: string,
  expectedNamespace: string,
): ParsedFmtCacheFile | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return;
  }

  const cache = value as FmtCacheFile;
  const { version, namespace, options, files } = cache;
  if (
    version !== fmtCacheVersion ||
    namespace !== expectedNamespace ||
    !Array.isArray(options) ||
    !Array.isArray(files) ||
    files.length % fileEntryWidth !== 0
  ) {
    return;
  }

  const optionsIndexes = new Map<string, number>();
  for (let index = 0; index < options.length; index++) {
    optionsIndexes.set(options[index], index);
  }

  const fileOffsets = new Map<string, number>();
  const optionsUseCounts = new Array<number>(options.length).fill(0);
  for (let offset = 0; offset < files.length; offset += fileEntryWidth) {
    const filePath = files[offset] as string;
    const optionsIndex = files[offset + optionsIndexOffset] as number;
    fileOffsets.set(filePath, offset);
    optionsUseCounts[optionsIndex]++;
  }

  return {
    cache,
    fileOffsets,
    optionsIndexes,
    optionsUseCounts,
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
  readonly #fileOffsets: Map<string, number>;
  readonly #optionsIndexes: Map<string, number>;
  readonly #optionsUseCounts: number[];
  #savedContent: string | undefined;
  #changed: boolean;

  constructor(
    filePath: string,
    parsed: ParsedFmtCacheFile,
    savedContent: string | undefined,
    changed: boolean,
  ) {
    this.#filePath = filePath;
    this.#cache = parsed.cache;
    this.#fileOffsets = parsed.fileOffsets;
    this.#optionsIndexes = parsed.optionsIndexes;
    this.#optionsUseCounts = parsed.optionsUseCounts;
    this.#savedContent = savedContent;
    this.#changed = changed;
  }

  get(filePath: string): FmtCacheEntry | undefined {
    const offset = this.#fileOffsets.get(filePath);
    if (offset === undefined) {
      return;
    }

    const { files, options } = this.#cache;
    const contentHash = files[offset + contentHashOffset] as string;
    const optionsHash = options[files[offset + optionsIndexOffset] as number];
    const state = fmtCacheStates[files[offset + stateOffset] as FmtCacheStateId];
    return [contentHash, optionsHash, state];
  }

  set(filePath: string, entry: FmtCacheEntry): void {
    const { files, options } = this.#cache;
    const [contentHash, optionsHash, state] = entry;
    const stateId = fmtCacheStateIds[state];
    const offset = this.#fileOffsets.get(filePath);

    if (offset !== undefined) {
      const currentOptionsIndex = files[offset + optionsIndexOffset] as number;
      if (
        files[offset + contentHashOffset] === contentHash &&
        options[currentOptionsIndex] === optionsHash &&
        files[offset + stateOffset] === stateId
      ) {
        return;
      }

      const optionsIndex = this.#getOrCreateOptionsIndex(optionsHash);
      if (currentOptionsIndex !== optionsIndex) {
        this.#optionsUseCounts[currentOptionsIndex]--;
        this.#optionsUseCounts[optionsIndex]++;
        files[offset + optionsIndexOffset] = optionsIndex;
      }
      files[offset + contentHashOffset] = contentHash;
      files[offset + stateOffset] = stateId;
    } else {
      const optionsIndex = this.#getOrCreateOptionsIndex(optionsHash);
      const nextOffset = files.length;
      files.push(filePath, contentHash, optionsIndex, stateId);
      this.#fileOffsets.set(filePath, nextOffset);
      this.#optionsUseCounts[optionsIndex]++;
    }

    this.#changed = true;
  }

  #getOrCreateOptionsIndex(optionsHash: string): number {
    const current = this.#optionsIndexes.get(optionsHash);
    if (current !== undefined) {
      return current;
    }

    const index = this.#cache.options.length;
    this.#cache.options.push(optionsHash);
    this.#optionsIndexes.set(optionsHash, index);
    this.#optionsUseCounts.push(0);
    return index;
  }

  #compactUnusedOptions(): void {
    if (!this.#optionsUseCounts.includes(0)) {
      return;
    }

    const { files, options } = this.#cache;
    const nextOptions: string[] = [];
    const nextUseCounts: number[] = [];
    const remappedIndexes = new Int32Array(options.length).fill(-1);
    for (let index = 0; index < options.length; index++) {
      const useCount = this.#optionsUseCounts[index];
      if (useCount > 0) {
        remappedIndexes[index] = nextOptions.length;
        nextOptions.push(options[index]);
        nextUseCounts.push(useCount);
      }
    }
    for (let offset = 0; offset < files.length; offset += fileEntryWidth) {
      const currentIndex = files[offset + optionsIndexOffset] as number;
      files[offset + optionsIndexOffset] = remappedIndexes[currentIndex];
    }

    options.splice(0, options.length, ...nextOptions);
    this.#optionsUseCounts.splice(0, this.#optionsUseCounts.length, ...nextUseCounts);
    this.#optionsIndexes.clear();
    for (let index = 0; index < options.length; index++) {
      this.#optionsIndexes.set(options[index], index);
    }
  }

  async save(): Promise<boolean> {
    if (!this.#changed) {
      return false;
    }

    this.#compactUnusedOptions();
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
    const parsed = parseCacheFile(content, namespace);
    if (!parsed) {
      return new FmtCacheStoreImpl(filePath, emptyCache, undefined, true);
    }

    return new FmtCacheStoreImpl(filePath, parsed, content, false);
  } catch (error) {
    const missing = isFileNotFoundError(error);
    return new FmtCacheStoreImpl(filePath, emptyCache, undefined, !missing);
  }
};

export { fmtCacheFileName, fmtCacheVersion, loadFmtCacheStore };
export type { FmtCacheEntry, FmtCacheFile, FmtCacheState, FmtCacheStore };
