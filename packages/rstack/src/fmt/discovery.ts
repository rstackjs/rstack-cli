import { resolveFmtOptions } from './config.ts';
import { discoverFmtPaths } from './discoverPaths.ts';
import { createIgnoreMatcher } from './ignore.ts';
import type { DiscoverFmtFilesOptions, FmtFileRequest, ResolvedFmtConfig } from './types.ts';

const createFileRequest = (filePath: string, config: ResolvedFmtConfig): FmtFileRequest => ({
  path: filePath,
  options: resolveFmtOptions(filePath, config),
});

/** Discovers worker-ready files without reading Prettier config files or `.prettierignore`. */
const discoverFmtFiles = async ({
  cwd,
  patterns,
  ignorePaths,
  config,
}: DiscoverFmtFilesOptions): Promise<FmtFileRequest[]> => {
  const [candidates, isIgnored] = await Promise.all([
    discoverFmtPaths({ cwd, patterns }),
    createIgnoreMatcher({ config, cwd, ignorePaths }),
  ]);
  if (candidates.length === 0) {
    return [];
  }

  const filePaths = candidates.filter((filePath) => !isIgnored(filePath));
  const files = filePaths.map((filePath) => createFileRequest(filePath, config));
  if (!files.some((file) => file.options.plugins?.length)) {
    return files;
  }

  const { createFmtPluginResolver } = await import(
    /* rspackChunkName: 'fmtPlugins' */
    './plugins.ts'
  );
  const resolvePlugins = createFmtPluginResolver(config.rootPath);

  return files.map((file) => ({
    ...file,
    options: resolvePlugins(file.options),
  }));
};

export { createFileRequest, discoverFmtFiles };
