import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import ignore from 'ignore';
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

const findGitRoot = async (cwd: string): Promise<string> => {
  let directoryPath = cwd;

  while (true) {
    if (await lstatSafe(path.join(directoryPath, '.git'))) {
      return directoryPath;
    }

    const parentPath = path.dirname(directoryPath);
    if (parentPath === directoryPath) {
      return cwd;
    }
    directoryPath = parentPath;
  }
};

class GitIgnoreMatcher {
  readonly #rootPath: string;
  readonly #matchers = new Map<string, ReturnType<typeof ignore>>();
  readonly #loads = new Map<string, Promise<void>>();
  readonly #ignoredDirectories = new Map<string, boolean>();

  private constructor(rootPath: string) {
    this.#rootPath = rootPath;
  }

  static async create(cwd: string): Promise<GitIgnoreMatcher> {
    const matcher = new GitIgnoreMatcher(await findGitRoot(cwd));
    await matcher.loadThrough(cwd);
    return matcher;
  }

  async loadThrough(directoryPath: string): Promise<void> {
    if (!isPathInside(this.#rootPath, directoryPath)) {
      return;
    }

    const relativePath = path.relative(this.#rootPath, directoryPath);
    const segments = relativePath ? relativePath.split(path.sep) : [];
    const loads = [this.#load(this.#rootPath)];
    let currentPath = this.#rootPath;

    for (const segment of segments) {
      currentPath = path.join(currentPath, segment);
      loads.push(this.#load(currentPath));
    }

    await Promise.all(loads);
  }

  async load(directoryPath: string): Promise<void> {
    if (isPathInside(this.#rootPath, directoryPath)) {
      await this.#load(directoryPath);
    }
  }

  isIgnored(filePath: string, isDirectory: boolean): boolean {
    if (this.#matchers.size === 0) {
      return false;
    }

    const relativePath = path.relative(this.#rootPath, filePath);
    if (relativePath === '' || !isRelativePathInside(relativePath)) {
      return false;
    }

    if (isDirectory) {
      return this.#isDirectoryIgnored(filePath, relativePath);
    }

    const parentPath = path.dirname(filePath);
    return (
      (parentPath !== this.#rootPath && this.#isDirectoryIgnored(parentPath)) ||
      this.#matches(relativePath, false)
    );
  }

  #load(directoryPath: string): Promise<void> {
    const cached = this.#loads.get(directoryPath);
    if (cached) {
      return cached;
    }

    // Ignore files may disappear or become unreadable during traversal.
    const loading = readFile(path.join(directoryPath, '.gitignore'), 'utf8')
      .then((content) => {
        this.#matchers.set(directoryPath, ignore().add(content));
      })
      .catch(() => undefined);

    this.#loads.set(directoryPath, loading);
    return loading;
  }

  #isDirectoryIgnored(
    directoryPath: string,
    relativePath = path.relative(this.#rootPath, directoryPath),
  ): boolean {
    const cached = this.#ignoredDirectories.get(directoryPath);
    if (cached !== undefined) {
      return cached;
    }

    // Git cannot re-include a path below an ignored directory.
    const parentPath = path.dirname(directoryPath);
    const ignored =
      (parentPath !== this.#rootPath && this.#isDirectoryIgnored(parentPath)) ||
      this.#matches(relativePath, true);
    this.#ignoredDirectories.set(directoryPath, ignored);
    return ignored;
  }

  #matches(relativePath: string, isDirectory: boolean): boolean {
    const segments = relativePath.split(path.sep);
    let directoryPath = this.#rootPath;
    let pathFromMatcher = segments.join('/');
    let ignored = false;

    for (const segment of segments) {
      const matcher = this.#matchers.get(directoryPath);
      if (matcher) {
        const result = matcher.test(isDirectory ? `${pathFromMatcher}/` : pathFromMatcher);

        if (result.ignored) {
          ignored = true;
        } else if (result.unignored) {
          ignored = false;
        }
      }

      directoryPath = path.join(directoryPath, segment);
      pathFromMatcher = pathFromMatcher.slice(segment.length + 1);
    }

    return ignored;
  }
}

const createTraversalOptions = (
  gitIgnore: GitIgnoreMatcher,
  isIncluded?: (filePath: string) => boolean,
) => {
  // tiny-readdir passes only a path to `ignore`, so retain the dirent type briefly.
  const directories = new Set<string>();

  return {
    followSymlinks: false,
    ignore: (targetPath: string) => {
      const isDirectory = directories.delete(targetPath);
      if (alwaysIgnoredNames.has(path.basename(targetPath))) {
        return true;
      }

      if (isDirectory) {
        return gitIgnore.isIgnored(targetPath, true);
      }

      return (
        isBinaryPath(targetPath) ||
        (isIncluded !== undefined && !isIncluded(targetPath)) ||
        gitIgnore.isIgnored(targetPath, false)
      );
    },
    onDirents: async (dirents: Dirent[]) => {
      const parentPath = getDirentParentPath(dirents[0]);
      let hasGitIgnore = false;

      for (const dirent of dirents) {
        if (dirent.isDirectory()) {
          directories.add(getDirentPath(dirent, parentPath));
        }
        if (dirent.name === '.gitignore') {
          hasGitIgnore = true;
        }
      }

      if (hasGitIgnore) {
        await gitIgnore.load(parentPath);
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

  if (traversalRoots.length) {
    const gitIgnore = await GitIgnoreMatcher.create(cwd);
    const results = await Promise.all(
      traversalRoots.map(async (rootPath) => {
        const stats = await lstatSafe(rootPath);
        if (!stats?.isDirectory()) {
          return [];
        }

        await gitIgnore.loadThrough(rootPath);
        if (gitIgnore.isIgnored(rootPath, true)) {
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

        return (await readdir(rootPath, createTraversalOptions(gitIgnore, isIncluded))).files;
      }),
    );

    for (const files of results) {
      for (const filePath of files) {
        candidates.add(filePath);
      }
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
