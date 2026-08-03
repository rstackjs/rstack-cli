// Derived from @prettier/cli, see THIRD_PARTY_NOTICES.md

import { readFileSync, writeFileSync } from 'node:fs';
import { format } from 'prettier';
import { getPrettierPlugins } from './prettierPlugins.ts';
import type { FmtFileRequest } from './types.ts';

/**
 * Use synchronous direct I/O inside the dedicated worker to avoid libuv
 * scheduling overhead. This prioritizes throughput over crash-safe replacement.
 */
const formatFile = async (
  { path, options }: FmtFileRequest,
  shouldWrite: boolean,
): Promise<boolean> => {
  const source = readFileSync(path, 'utf8');
  const formatted = await format(source, {
    ...options,
    plugins: await getPrettierPlugins(options),
  });

  if (source === formatted) {
    return false;
  }

  if (shouldWrite) {
    writeFileSync(path, formatted, 'utf8');
  }

  return true;
};

/** Confirms that the worker module and its runtime dependencies are ready. */
const initializeFmtWorker = (): true => true;

export { formatFile, initializeFmtWorker };
