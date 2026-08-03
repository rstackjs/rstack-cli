import { resolveFmtOptions } from './config.ts';
import { discoverFmtPaths } from './discoverPaths.ts';
import { createFmtIgnoreMatcher } from './ignore.ts';
import { createFmtPluginResolver, type FmtPluginResolver } from './plugins.ts';
import type { DiscoverFmtFilesOptions, FmtFileRequest, ResolvedFmtConfig } from './types.ts';

const createFileRequest = (
  filePath: string,
  config: ResolvedFmtConfig,
  resolvePlugins: FmtPluginResolver,
): FmtFileRequest => ({
  path: filePath,
  options: resolvePlugins(resolveFmtOptions(filePath, config)),
});

/** Discovers worker-ready files without reading Prettier config files or `.prettierignore`. */
const discoverFmtFiles = async ({
  cwd,
  patterns,
  config,
}: DiscoverFmtFilesOptions): Promise<FmtFileRequest[]> => {
  const candidates = await discoverFmtPaths({ cwd, patterns });
  if (candidates.length === 0) {
    return [];
  }

  const isFmtIgnored = createFmtIgnoreMatcher(config);
  const filePaths = candidates.filter((filePath) => !isFmtIgnored(filePath));
  const resolvePlugins = createFmtPluginResolver(config.rootPath);

  return filePaths.map((filePath) => createFileRequest(filePath, config, resolvePlugins));
};

export { discoverFmtFiles };
