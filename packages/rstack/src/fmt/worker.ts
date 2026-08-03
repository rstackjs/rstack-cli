// Derived from @prettier/cli, see THIRD_PARTY_NOTICES.md

import { readFileSync, writeFileSync } from 'node:fs';
import {
  format,
  getFileInfo,
  type FileInfoOptions,
  type Options as PrettierOptions,
} from 'prettier';
import { getPrettierPlugins } from './prettierPlugins.ts';
import type { FmtFileRequest } from './types.ts';

type PrettierPlugins = NonNullable<PrettierOptions['plugins']>;
type FormatFileResult = 'changed' | 'unchanged' | 'unsupported';

const fileInfoOptions = {
  ignorePath: [],
  resolveConfig: false,
  withNodeModules: true,
} satisfies FileInfoOptions;

/** Uses the configured parser or infers one without loading Prettier config. */
const resolveFmtParser = async (
  filePath: string,
  options: PrettierOptions,
  plugins: PrettierPlugins,
): Promise<PrettierOptions['parser'] | null> =>
  options.parser ??
  (
    await getFileInfo(filePath, {
      ...fileInfoOptions,
      plugins,
    })
  ).inferredParser;

/**
 * Use synchronous direct I/O inside the dedicated worker to avoid libuv
 * scheduling overhead. This prioritizes throughput over crash-safe replacement.
 */
const formatFile = async (
  { path, options }: FmtFileRequest,
  shouldWrite: boolean,
): Promise<FormatFileResult> => {
  const plugins = await getPrettierPlugins(options);
  const parser = await resolveFmtParser(path, options, plugins);
  if (!parser) {
    return 'unsupported';
  }

  const source = readFileSync(path, 'utf8');
  const formatted = await format(source, {
    ...options,
    parser,
    plugins,
  });

  if (source === formatted) {
    return 'unchanged';
  }

  if (shouldWrite) {
    writeFileSync(path, formatted, 'utf8');
  }

  return 'changed';
};

/** Confirms that the worker module and its runtime dependencies are ready. */
const initializeFmtWorker = (): true => true;

export { formatFile, initializeFmtWorker };
