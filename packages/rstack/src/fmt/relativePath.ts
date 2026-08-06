import path from 'node:path';

type RelativePathResolver = (filePath: string) => string;

const createRelativePathResolver = (rootPath: string): RelativePathResolver => {
  const rootPrefix = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;

  return (filePath) =>
    filePath === rootPath
      ? ''
      : filePath.startsWith(rootPrefix)
        ? filePath.slice(rootPrefix.length)
        : path.relative(rootPath, filePath);
};

export { createRelativePathResolver };
export type { RelativePathResolver };
