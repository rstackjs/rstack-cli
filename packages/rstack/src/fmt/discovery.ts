import path from 'node:path';
import { discoverFmtPaths } from './discoverPaths.ts';
import { createFmtFileResolver } from './fileResolver.ts';
import { createIgnoreMatcher } from './ignore.ts';
import type { DiscoverFmtFilesOptions, FmtFileRequest } from './types.ts';

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

  const resolveFile = createFmtFileResolver(config);

  return Promise.all(filePaths.map((filePath) => resolveFile(filePath)));
};

export { discoverFmtFiles };
