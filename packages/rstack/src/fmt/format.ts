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
  const formatOptions = {
    ...options,
    filepath: filePath,
  };
  const plugins = await getPrettierPlugins(formatOptions);
  const parser = await resolveFmtParser(filePath, formatOptions, plugins);

  if (!parser) {
    return {
      status: 'skipped',
      reason: 'unsupported',
    };
  }

  const resolvedOptions = { ...formatOptions, parser, plugins };

  if (cursorOffset === undefined) {
    return {
      status: 'formatted',
      formatted: await format(source, resolvedOptions),
    };
  }

  const result = await formatWithCursor(source, {
    ...resolvedOptions,
    cursorOffset,
  });

  return {
    status: 'formatted',
    formatted: result.formatted,
    cursorOffset: result.cursorOffset,
  };
};

export { formatText };
