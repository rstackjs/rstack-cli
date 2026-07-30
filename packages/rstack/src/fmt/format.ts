import { format, formatWithCursor, getFileInfo } from 'prettier';
import { resolveFmtOptions } from './config.ts';
import type { FormatTextOptions, FormatTextResult } from './types.ts';

/** Formats source text without reading formatter config or ignore files. */
const formatText = async (
  source: string,
  { filePath, cursorOffset, config }: FormatTextOptions,
): Promise<FormatTextResult> => {
  const options = resolveFmtOptions(filePath, config);

  if (options.plugins?.length) {
    throw new Error('Prettier plugins are not supported yet.');
  }

  const parser =
    options.parser ??
    (
      await getFileInfo(filePath, {
        ignorePath: [],
        resolveConfig: false,
        withNodeModules: true,
      })
    ).inferredParser;

  if (!parser) {
    return {
      status: 'skipped',
      reason: 'unsupported',
    };
  }

  const formatOptions = {
    ...options,
    filepath: filePath,
    parser,
  };

  if (cursorOffset === undefined) {
    return {
      status: 'formatted',
      formatted: await format(source, formatOptions),
    };
  }

  const result = await formatWithCursor(source, {
    ...formatOptions,
    cursorOffset,
  });

  return {
    status: 'formatted',
    formatted: result.formatted,
    cursorOffset: result.cursorOffset,
  };
};

export { formatText };
