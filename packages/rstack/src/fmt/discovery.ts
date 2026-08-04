import { resolveFmtOptions } from './config.ts';
import { discoverFmtPaths } from './discoverPaths.ts';
import { createFmtIgnoreMatcher } from './ignore.ts';
import type { DiscoverFmtFilesOptions, FmtFileRequest, ResolvedFmtConfig } from './types.ts';

const createFileRequest = (filePath: string, config: ResolvedFmtConfig): FmtFileRequest => ({
  path: filePath,
  options: resolveFmtOptions(filePath, config),
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
  const files = filePaths.map((filePath) => createFileRequest(filePath, config));
  if (!files.some((file) => file.options.plugins?.length)) {
    return files;
  }

  const { createFmtPluginResolver } = await import(
    /* rspackChunkName: 'fmtPlugins' */
    './plugins.ts'
  );
  const resolvePlugins = createFmtPluginResolver(config.rootPath);

  return files.map((file) => ({ ...file, options: resolvePlugins(file.options) }));
};

export { createFileRequest, discoverFmtFiles };
