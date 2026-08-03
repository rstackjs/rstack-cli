import { format, formatWithCursor } from 'prettier';
import { resolveFmtOptions } from './config.ts';
import { resolveFmtParser } from './parser.ts';
import { createFmtPluginResolver } from './plugins.ts';
import { getPrettierPlugins } from './prettierPlugins.ts';
import type { FormatTextOptions, FormatTextResult } from './types.ts';

/** Formats source text without reading formatter config or ignore files. */
const formatText = async (
  source: string,
  { filePath, cursorOffset, config }: FormatTextOptions,
): Promise<FormatTextResult> => {
  const options = createFmtPluginResolver(config.rootPath)(resolveFmtOptions(filePath, config));
  const parser = await resolveFmtParser(filePath, options);

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
  const plugins = await getPrettierPlugins(formatOptions);

  if (cursorOffset === undefined) {
    return {
      status: 'formatted',
      formatted: await format(source, { ...formatOptions, plugins }),
    };
  }

  const result = await formatWithCursor(source, {
    ...formatOptions,
    cursorOffset,
    plugins,
  });

  return {
    status: 'formatted',
    formatted: result.formatted,
    cursorOffset: result.cursorOffset,
  };
};

export { formatText };
