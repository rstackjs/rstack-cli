// Derived from @prettier/cli, see THIRD_PARTY_NOTICES.md

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import type { FmtCacheEntry } from './cacheStore.ts';
import type { FmtFileCache, FmtFileRequest, FmtWorkerResult } from './types.ts';

interface FormatFileTask {
  file: FmtFileRequest;
  shouldWrite: boolean;
  cache?: FmtFileCache;
}

const hashContent = (content: Uint8Array): string =>
  createHash('sha256').update(content).digest('hex');

/**
 * Use synchronous direct I/O inside the dedicated worker to avoid libuv
 * scheduling overhead. This prioritizes throughput over crash-safe replacement.
 */
const formatFile = async ({
  file,
  shouldWrite,
  cache,
}: FormatFileTask): Promise<FmtWorkerResult> => {
  let source: string | undefined;
  let contentHash: string | undefined;
  const fileCache = shouldWrite ? undefined : cache;

  const readSource = (): string => {
    if (!fileCache) {
      return readFileSync(file.path, 'utf8');
    }

    const content = readFileSync(file.path);
    contentHash = hashContent(content);
    return content.toString('utf8');
  };

  if (fileCache?.entry && fileCache.entry[1] === fileCache.optionsHash) {
    source = readSource();
    const { entry } = fileCache;
    if (entry[0] === contentHash) {
      return { status: entry[2] === 'clean' ? 'unchanged' : 'changed' };
    }
  }

  const { formatFmtSource } = await import('./format.ts');
  const result = await formatFmtSource(file, () => (source ??= readSource()));
  if (result.status === 'unsupported') {
    return { status: 'unsupported' };
  }

  const unchanged = result.source === result.formatted;

  if (!unchanged && shouldWrite) {
    writeFileSync(file.path, result.formatted, 'utf8');
  }

  const status = unchanged ? 'unchanged' : 'changed';
  if (!fileCache || contentHash === undefined) {
    return { status };
  }

  const cacheEntry: FmtCacheEntry = [
    contentHash,
    fileCache.optionsHash,
    unchanged ? 'clean' : 'dirty',
  ];
  return { status, cacheEntry };
};

/** Confirms that the worker module is ready. Formatter dependencies load only on a cache miss. */
const initializeFmtWorker = (): true => true;

export { formatFile, initializeFmtWorker };
