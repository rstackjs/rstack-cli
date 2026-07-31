/**
 * Derived from @prettier/cli v0.12.0.
 * SPDX-License-Identifier: MIT
 * Modified by Rstack contributors.
 */

import { readFile, writeFile } from 'atomically';
import { format } from 'prettier';
import type { FmtFileRequest } from '../../types.ts';

const formatFileSerial = async (
  { path, options }: FmtFileRequest,
  shouldWrite: boolean,
): Promise<boolean> => {
  const source = await readFile(path, 'utf8');
  const formatted = await format(source, options);

  if (source === formatted) {
    return false;
  }

  if (shouldWrite) {
    await writeFile(path, formatted, 'utf8');
  }

  return true;
};

export { formatFileSerial };
