// Derived from @prettier/cli, see THIRD_PARTY_NOTICES.md

import { hash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import type { FmtCacheEntry } from './cacheStore.ts';
import { hasDottedBasename } from './pathHelpers.ts';
import type { FmtFileCache, FmtFileRequest, FmtWorkerResult } from './types.ts';

interface FormatFileTask {
  file: FmtFileRequest;
  shouldWrite: boolean;
  cache?: FmtFileCache;
}

const hashContent = (content: string | Uint8Array): string =>
  hash('sha256', content, 'base64url').slice(0, 16);

/**
 * Synchronous file I/O avoids libuv scheduling overhead in workers and single-file
 * main-thread runs. This favors throughput over crash-safe file replacement.
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
    const { entry } = cache;
    if (entry[2] === 'unsupported') {
      if (entry[0] === '') {
        if (hasDottedBasename(file.path)) {
          return { status: 'unsupported' };
        }
      } else {
        sourceBuffer = readFileSync(file.path);
        contentHash = hashContent(sourceBuffer);
        if (entry[0] === contentHash) {
          return { status: 'unsupported' };
        }
      }
    } else {
      sourceBuffer = readFileSync(file.path);
      contentHash = hashContent(sourceBuffer);
      if (entry[0] === contentHash && (!shouldWrite || entry[2] === 'clean')) {
        return { status: entry[2] === 'clean' ? 'unchanged' : 'changed' };
      }
    }
  }

  const { formatFmtSource } = await import('./format.ts');
  const result = await formatFmtSource(file, () => (source ??= readSource()));
  if (result.status === 'unsupported') {
    return cache
      ? {
          status: 'unsupported',
          cacheEntry: [
            hasDottedBasename(file.path)
              ? ''
              : (contentHash ??
                hashContent(sourceBuffer ?? readFileSync(file.path))),
            cache.optionsHash,
            'unsupported',
          ],
        }
      : { status: 'unsupported' };
  }

  const unchanged = result.source === result.formatted;

  if (!unchanged && shouldWrite) {
    writeFileSync(file.path, result.formatted, 'utf8');
  }

  const status = unchanged ? 'unchanged' : 'changed';
  if (!cache) {
    return { status };
  }

  // Cache only the input we actually checked. Prettier or a plugin may produce
  // non-idempotent output, so writing it does not prove that it is clean.
  // Keeping the input hash makes the next run verify the newly written content.
  const cacheEntry: FmtCacheEntry = [
    contentHash ?? hashContent(result.source),
    cache.optionsHash,
    unchanged ? 'clean' : 'dirty',
  ];
  return { status, cacheEntry };
};

/** Confirms that the worker module is ready. Formatter dependencies load only on a cache miss. */
const initializeFmtWorker = (): true => true;

export { formatFile, initializeFmtWorker };
