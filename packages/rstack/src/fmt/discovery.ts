import { resolveFmtOptions } from './config.ts';
import { discoverFmtPaths } from './discoverPaths.ts';
import { createFmtIgnoreMatcher } from './ignore.ts';
import { resolveFmtParser } from './parser.ts';
import { createFmtPluginResolver, type FmtPluginResolver } from './plugins.ts';
import type { DiscoverFmtFilesOptions, FmtFileRequest, ResolvedFmtConfig } from './types.ts';

const resolveFileRequest = async (
  filePath: string,
  config: ResolvedFmtConfig,
  resolvePlugins: FmtPluginResolver,
): Promise<FmtFileRequest | undefined> => {
  const options = resolvePlugins(resolveFmtOptions(filePath, config));
  const parser = await resolveFmtParser(filePath, options);
  if (!parser) {
    return;
  }

  return {
    path: filePath,
    options: {
      ...options,
      filepath: filePath,
      parser,
    },
  };
};

/** Discovers format-ready files without reading Prettier config files or `.prettierignore`. */
const discoverFmtFiles = async ({
  cwd,
  patterns,
  config,
}: DiscoverFmtFilesOptions): Promise<FmtFileRequest[]> => {
  const candidates = await discoverFmtPaths({ cwd, patterns });
  if (candidates.length === 0) {
    return [];
  }

  const isFmtIgnored = config.ignorePatterns.length ? createFmtIgnoreMatcher(config) : undefined;
  const filePaths = isFmtIgnored
    ? candidates.filter((filePath) => !isFmtIgnored(filePath))
    : candidates;
  const resolvePlugins = createFmtPluginResolver(config.rootPath);
  const files = await Promise.all(
    filePaths.map((filePath) => resolveFileRequest(filePath, config, resolvePlugins)),
  );

  return files.filter((file): file is FmtFileRequest => file !== undefined);
};

export { discoverFmtFiles };
