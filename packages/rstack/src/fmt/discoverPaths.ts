import { lstat } from 'node:fs/promises';
import path from 'node:path';
import isBinaryPath from 'is-binary-path';
import micromatch from 'micromatch';
import readdir, { type Dirent } from 'tiny-readdir';

const alwaysIgnoredNames = new Set(['.git', '.sl', '.svn', '.hg', '.jj', 'node_modules']);

interface DiscoverFmtPathsOptions {
  /** Absolute directory used to resolve input paths. */
  cwd: string;
  patterns?: string[];
}

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error;

const lstatSafe = async (filePath: string) => {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (!isErrnoException(error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
};

const isRelativePathInside = (relativePath: string): boolean =>
  relativePath !== '..' &&
  !relativePath.startsWith(`..${path.sep}`) &&
  !path.isAbsolute(relativePath);

const isPathInside = (rootPath: string, filePath: string): boolean =>
  isRelativePathInside(path.relative(rootPath, filePath));

const toPosixPath = (filePath: string): string =>
  path.sep === '\\' ? filePath.replaceAll('\\', '/') : filePath;

/** Supports both the legacy tiny-readdir type and Node.js 24 Dirent. */
const getDirentParentPath = (dirent: Dirent): string =>
  (dirent as Dirent & { parentPath?: string }).parentPath ?? dirent.path;

/** Mirrors the path passed to tiny-readdir's ignore callback. */
const getDirentPath = (dirent: Dirent, parentPath: string): string =>
  `${parentPath}${parentPath === path.sep ? '' : path.sep}${dirent.name}`;

const hasAlwaysIgnoredSegment = (cwd: string, filePath: string): boolean =>
  path
    .relative(cwd, filePath)
    .split(path.sep)
    .some((segment) => alwaysIgnoredNames.has(segment));

const createTraversalOptions = (isIncluded?: (filePath: string) => boolean) => {
  // tiny-readdir passes only a path to `ignore`, so retain the dirent type briefly.
  const directories = new Set<string>();

  return {
    followSymlinks: false,
    ignore: (targetPath: string) => {
      const isDirectory = directories.delete(targetPath);
      if (alwaysIgnoredNames.has(path.basename(targetPath))) {
        return true;
      }

      return (
        !isDirectory &&
        (isBinaryPath(targetPath) || (isIncluded !== undefined && !isIncluded(targetPath)))
      );
    },
    onDirents: (dirents: Dirent[]) => {
      const parentPath = getDirentParentPath(dirents[0]);

      for (const dirent of dirents) {
        if (dirent.isDirectory()) {
          directories.add(getDirentPath(dirent, parentPath));
        }
      }

      return undefined;
    },
  };
};

const normalizeGlob = (cwd: string, pattern: string): string => {
  const relativePattern = path.isAbsolute(pattern) ? path.relative(cwd, pattern) : pattern;
  return toPosixPath(relativePattern);
};

type PatternEntry = {
  kind: 'file' | 'directory' | 'glob' | 'negative-glob';
  value: string;
};

type ClassifiedPatterns = {
  files: string[];
  directories: string[];
  globs: string[];
  negativeGlobs: string[];
};

const classifyPatterns = async (cwd: string, patterns: string[]): Promise<ClassifiedPatterns> => {
  const entries = await Promise.all(
    patterns.map(async (pattern): Promise<PatternEntry | undefined> => {
      if (pattern.startsWith('!')) {
        return { kind: 'negative-glob', value: normalizeGlob(cwd, pattern.slice(1)) };
      }

      const filePath = path.resolve(cwd, pattern);
      if (hasAlwaysIgnoredSegment(cwd, filePath)) {
        return;
      }

      const stats = await lstatSafe(filePath);
      if (stats?.isFile()) {
        return { kind: 'file', value: filePath };
      }
      if (stats?.isDirectory()) {
        return { kind: 'directory', value: filePath };
      }
      if (stats) {
        return;
      }

      return { kind: 'glob', value: normalizeGlob(cwd, pattern) };
    }),
  );

  const result: ClassifiedPatterns = {
    files: [],
    directories: [],
    globs: [],
    negativeGlobs: [],
  };

  for (const entry of entries) {
    if (!entry) {
      continue;
    }

    switch (entry.kind) {
      case 'file':
        result.files.push(entry.value);
        break;
      case 'directory':
        result.directories.push(entry.value);
        break;
      case 'glob':
        result.globs.push(entry.value);
        break;
      case 'negative-glob':
        result.negativeGlobs.push(entry.value);
        break;
    }
  }

  return result;
};

const getOutermostPaths = (paths: string[]): string[] => {
  const sortedPaths = [...new Set(paths)].sort((left, right) => left.length - right.length);
  const outermostPaths: string[] = [];

  for (const filePath of sortedPaths) {
    if (!outermostPaths.some((parentPath) => isPathInside(parentPath, filePath))) {
      outermostPaths.push(filePath);
    }
  }

  return outermostPaths;
};

/** Merges overlapping roots; micromatch remains responsible for glob syntax. */
const getTraversalRoots = (cwd: string, directories: string[], globs: string[]): string[] => {
  const globRoots = globs.map((pattern) => path.resolve(cwd, micromatch.scan(pattern).base || '.'));

  return getOutermostPaths([...directories, ...globRoots]);
};

const discoverFmtPaths = async ({
  cwd,
  patterns: inputPatterns,
}: DiscoverFmtPathsOptions): Promise<string[]> => {
  const patterns = inputPatterns?.length ? inputPatterns : ['.'];
  const {
    files: explicitFiles,
    directories,
    globs,
    negativeGlobs,
  } = await classifyPatterns(cwd, patterns);
  const directoryRoots = getOutermostPaths(directories);
  const globMatchers = globs.map((pattern) => micromatch.matcher(pattern, { dot: true }));
  const candidates = new Set(explicitFiles);
  const traversalRoots = getTraversalRoots(cwd, directoryRoots, globs);

  const results = await Promise.all(
    traversalRoots.map(async (rootPath) => {
      const stats = await lstatSafe(rootPath);
      if (!stats?.isDirectory()) {
        return [];
      }

      const includesAll = directoryRoots.some((directoryPath) =>
        isPathInside(directoryPath, rootPath),
      );
      const isIncluded = includesAll
        ? undefined
        : (filePath: string): boolean => {
            if (directoryRoots.some((directoryPath) => isPathInside(directoryPath, filePath))) {
              return true;
            }

            const relativePath = toPosixPath(path.relative(cwd, filePath));
            return globMatchers.some((matches) => matches(relativePath));
          };

      return (await readdir(rootPath, createTraversalOptions(isIncluded))).files;
    }),
  );

  for (const files of results) {
    for (const filePath of files) {
      candidates.add(filePath);
    }
  }

  const negativeGlobMatchers = negativeGlobs.map((pattern) =>
    micromatch.matcher(pattern, { dot: true }),
  );
  const filePaths: string[] = [];

  for (const filePath of candidates) {
    if (isBinaryPath(filePath)) {
      continue;
    }

    if (negativeGlobMatchers.length) {
      const relativePath = toPosixPath(path.relative(cwd, filePath));
      if (negativeGlobMatchers.some((matches) => matches(relativePath))) {
        continue;
      }
    }

    filePaths.push(filePath);
  }

  return filePaths.sort();
};

export { discoverFmtPaths };
