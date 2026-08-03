// Derived from @prettier/cli, see THIRD_PARTY_NOTICES.md

import { readFile, writeFile } from 'atomically';
import { format } from 'prettier';
import { resolveFmtParser } from './parser.ts';
import { getPrettierPlugins } from './prettierPlugins.ts';
import type { FmtFileRequest, FmtWorkerFileResult } from './types.ts';

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
): Promise<FmtWorkerFileResult> => {
  const plugins = await getPrettierPlugins(options);
  const parser = await resolveFmtParser(path, options, plugins);
  if (!parser) {
    return 'unsupported';
  }

  const source = await readFile(path, 'utf8');
  const formatted = await format(source, {
    ...options,
    parser,
    plugins,
  });

  if (source === formatted) {
    return 'unchanged';
  }

  if (shouldWrite) {
    await writeFile(path, formatted, atomicWriteOptions);
  }

  return 'changed';
};

/** Confirms that the worker module and its runtime dependencies are ready. */
const initializeFmtWorker = (): true => true;

export { formatFile, initializeFmtWorker };
