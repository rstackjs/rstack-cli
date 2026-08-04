// Derived from @prettier/cli, see THIRD_PARTY_NOTICES.md

import {
  format,
  getFileInfo,
  type FileInfoOptions,
  type Options as PrettierOptions,
} from 'prettier';
import { getPrettierPlugins } from './prettierPlugins.ts';
import type { FmtFileRequest } from './types.ts';

type PrettierPlugins = NonNullable<PrettierOptions['plugins']>;

type FormatFmtSourceResult =
  { status: 'unsupported' } | { status: 'formatted'; source: string; formatted: string };

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

/** Formats file contents, requesting the source only once a parser is known. */
const formatFmtSource = async (
  { path, options }: FmtFileRequest,
  readSource: () => string,
): Promise<FormatFmtSourceResult> => {
  const plugins = await getPrettierPlugins(options, path);
  const parser = await resolveFmtParser(path, options, plugins);
  if (!parser) {
    return { status: 'unsupported' };
  }

  const source = readSource();
  const formatted = await format(source, {
    ...options,
    filepath: path,
    parser,
    plugins,
  });

  return { status: 'formatted', source, formatted };
};

export { formatFmtSource };
