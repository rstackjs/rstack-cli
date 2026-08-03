// Derived from @prettier/cli, see THIRD_PARTY_NOTICES.md

import { readFileSync, writeFileSync } from 'node:fs';
import { formatFmtSource } from './format.ts';
import type { FmtFileRequest } from './types.ts';

type FormatFileResult = 'changed' | 'unchanged' | 'unsupported';

interface FormatFileTask {
  file: FmtFileRequest;
  shouldWrite: boolean;
}

/**
 * Use synchronous direct I/O inside the dedicated worker to avoid libuv
 * scheduling overhead. This prioritizes throughput over crash-safe replacement.
 */
const formatFile = async ({ file, shouldWrite }: FormatFileTask): Promise<FormatFileResult> => {
  const result = await formatFmtSource(file, () => readFileSync(file.path, 'utf8'));
  if (result.status === 'unsupported') {
    return 'unsupported';
  }

  const { source, formatted } = result;
  if (source === formatted) {
    return 'unchanged';
  }

  if (shouldWrite) {
    writeFileSync(file.path, formatted, 'utf8');
  }

  return 'changed';
};

/** Confirms that the worker module and its runtime dependencies are ready. */
const initializeFmtWorker = (): true => true;

export { formatFile, initializeFmtWorker };
