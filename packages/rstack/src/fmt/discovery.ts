import { createFmtOptionsResolver, type FmtOptionsResolver } from './config.ts';
import { discoverFmtPaths } from './discoverPaths.ts';
import { createIgnoreMatcher } from './ignore.ts';
import type { DiscoverFmtFilesOptions, FmtFileRequest } from './types.ts';

const createFileRequest = (
  filePath: string,
  resolveOptions: FmtOptionsResolver,
): FmtFileRequest => ({
  path: filePath,
  options: resolveOptions(filePath),
});

/** Discovers worker-ready files without automatically reading Prettier config or ignore files. */
const discoverFmtFiles = async ({
  cwd,
  patterns,
  ignorePaths,
  withNodeModules,
  config,
}: DiscoverFmtFilesOptions): Promise<FmtFileRequest[]> => {
  const isIgnored = await createIgnoreMatcher({ config, cwd, ignorePaths });
  const candidates = await discoverFmtPaths({
    cwd,
    patterns,
    withNodeModules,
    isIgnored,
  });
  if (candidates.length === 0) {
    return [];
  }

  const filePaths = candidates.filter((filePath) => !isIgnored(filePath));
  const resolveOptions = createFmtOptionsResolver(config);
  const files = filePaths.map((filePath) => createFileRequest(filePath, resolveOptions));
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
