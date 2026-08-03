// Derived from @prettier/cli, see THIRD_PARTY_NOTICES.md

import { readFile, writeFile } from 'atomically';
import { format } from 'prettier';
import { getPrettierPlugins } from './prettierPlugins.ts';
import type { FmtFileRequest } from './types.ts';

/**
 * Formatting output can be regenerated, so avoid waiting for a durability sync
 * after every file, which is especially expensive during parallel formatting.
 * `atomically` still uses a temporary file and rename for atomic replacement.
 */
const atomicWriteOptions = {
  encoding: 'utf8',
  fsync: false,
} as const;

const formatFile = async (
  { path, options }: FmtFileRequest,
  shouldWrite: boolean,
): Promise<boolean> => {
  const source = await readFile(path, 'utf8');
  const formatted = await format(source, {
    ...options,
    plugins: await getPrettierPlugins(options),
  });

  if (source === formatted) {
    return false;
  }

  if (shouldWrite) {
    await writeFile(path, formatted, atomicWriteOptions);
  }

  return true;
};

/** Confirms that the worker module and its runtime dependencies are ready. */
const initializeFmtWorker = (): true => true;

export { formatFile, initializeFmtWorker };
