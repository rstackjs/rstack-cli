import path from 'node:path';
import { createFmtOptionsResolver, type FmtOptionsResolver } from './config.ts';
import { discoverFmtPaths } from './discoverPaths.ts';
import { createIgnoreMatcher } from './ignore.ts';
import type { FmtPluginResolver } from './plugins.ts';
import type { DiscoverFmtFilesOptions, FmtFileRequest } from './types.ts';

const createFileRequest = (
  filePath: string,
  resolveOptions: FmtOptionsResolver,
): FmtFileRequest => ({
  path: filePath,
  options: resolveOptions(filePath),
});

/** Imports the plugin chunk on first use and shares the resolver across calls. */
const createLazyPluginResolver = (rootPath: string): (() => Promise<FmtPluginResolver>) => {
  let resolver: Promise<FmtPluginResolver> | undefined;

  return () =>
    (resolver ??= import(
      /* rspackChunkName: 'fmtPlugins' */
      './plugins.ts'
    ).then(({ createFmtPluginResolver }) => createFmtPluginResolver(rootPath)));
};

/** Resolves the plugin specifiers of a request whose options configure plugins. */
const resolveFileRequestPlugins = async (
  file: FmtFileRequest,
  getPluginResolver: () => Promise<FmtPluginResolver>,
): Promise<FmtFileRequest> =>
  file.options.plugins?.length
    ? { ...file, options: (await getPluginResolver())(file.options) }
    : file;

const createDirMatcher = (dirPath: string): ((filePath: string) => boolean) => {
  const prefix = dirPath.endsWith(path.sep) ? dirPath : `${dirPath}${path.sep}`;
  return (filePath) => filePath === dirPath || filePath.startsWith(prefix);
};

/** Discovers worker-ready files without automatically reading Prettier config or ignore files. */
const discoverFmtFiles = async ({
  cwd,
  excludedDirPath,
  patterns,
  ignorePaths,
  withNodeModules,
  config,
}: DiscoverFmtFilesOptions): Promise<FmtFileRequest[]> => {
  const isIgnored = await createIgnoreMatcher({ config, cwd, ignorePaths });
  const isExcluded = excludedDirPath ? createDirMatcher(excludedDirPath) : undefined;
  const shouldIgnore = isExcluded
    ? (filePath: string, isDirectory = false) =>
        isExcluded(filePath) || isIgnored(filePath, isDirectory)
    : isIgnored;
  const filePaths = await discoverFmtPaths({
    cwd,
    patterns,
    withNodeModules,
    isIgnored: shouldIgnore,
  });
  if (filePaths.length === 0) {
    return [];
  }

  const resolveOptions = createFmtOptionsResolver(config);
  const getPluginResolver = createLazyPluginResolver(config.rootPath);

  return Promise.all(
    filePaths.map((filePath) =>
      resolveFileRequestPlugins(createFileRequest(filePath, resolveOptions), getPluginResolver),
    ),
  );
};

export { createFileRequest, createLazyPluginResolver, discoverFmtFiles, resolveFileRequestPlugins };
