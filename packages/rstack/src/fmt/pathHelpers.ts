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

/** Prettier only inspects a file's shebang when its basename contains no dot. */
const hasDottedBasename = (filePath: string): boolean => path.basename(filePath).includes('.');

export { createRelativePathResolver, hasDottedBasename, toPosixPath };
export type { RelativePathResolver };
