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

const hashContent = (content: string | Uint8Array): string =>
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
  let sourceBuffer: Buffer | undefined;
  let contentHash: string | undefined;

  const readSource = (shouldHash = !shouldWrite): string => {
    if (sourceBuffer !== undefined) {
      return sourceBuffer.toString('utf8');
    }

    if (!cache || !shouldHash) {
      return readFileSync(file.path, 'utf8');
    }

    sourceBuffer = readFileSync(file.path);
    contentHash = hashContent(sourceBuffer);
    return sourceBuffer.toString('utf8');
  };

  if (cache?.entry && cache.entry[1] === cache.optionsHash) {
    sourceBuffer = readFileSync(file.path);
    contentHash = hashContent(sourceBuffer);
    const { entry } = cache;
    if (entry[0] === contentHash && (!shouldWrite || entry[2] === 'clean')) {
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
  if (!cache) {
    return { status };
  }

  const cacheHash =
    shouldWrite && !unchanged
      ? hashContent(result.formatted)
      : (contentHash ?? hashContent(result.source));
  const cacheEntry: FmtCacheEntry = [
    cacheHash,
    cache.optionsHash,
    shouldWrite || unchanged ? 'clean' : 'dirty',
  ];
  return { status, cacheEntry };
};

/** Confirms that the worker module is ready. Formatter dependencies load only on a cache miss. */
const initializeFmtWorker = (): true => true;

export { formatFile, initializeFmtWorker };
