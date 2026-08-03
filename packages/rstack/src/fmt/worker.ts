// Derived from @prettier/cli, see THIRD_PARTY_NOTICES.md

import { readFile, writeFile } from 'atomically';
import { format } from 'prettier';
import { getPrettierPlugins } from './prettierPlugins.ts';
import type { FmtFileRequest } from './types.ts';

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
    await writeFile(path, formatted, 'utf8');
  }

  return true;
};

/** Confirms that the worker module and its runtime dependencies are ready. */
const initializeFmtWorker = (): true => true;

export { formatFile, initializeFmtWorker };
