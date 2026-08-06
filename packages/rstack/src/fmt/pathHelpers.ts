import path from 'node:path';

type RelativePathResolver = (filePath: string) => string;

const toPosixPath: (filePath: string) => string =
  path.sep === '\\' ? (filePath) => filePath.replaceAll('\\', '/') : (filePath) => filePath;

const createRelativePathResolver = (rootPath: string): RelativePathResolver => {
  const rootPrefix = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;

  return (filePath) =>
    filePath === rootPath
      ? ''
      : filePath.startsWith(rootPrefix)
        ? filePath.slice(rootPrefix.length)
        : path.relative(rootPath, filePath);
};

export { createRelativePathResolver, toPosixPath };
export type { RelativePathResolver };
