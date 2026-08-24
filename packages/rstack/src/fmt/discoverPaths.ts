import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import isBinaryPath from 'is-binary-path';
import micromatch from 'micromatch';
import readdir, { type Dirent, type DirentLike } from 'tiny-readdir';
import type { GitIgnoreMatcher as NativeGitIgnoreMatcher } from '../../binding.cjs';
import { loadNativeBinding } from '../native/index.ts';
import type {
  BatchIgnoreContext,
  IgnoreMatcher,
  IgnorePredicate,
} from './ignore.ts';
import {
  createRelativePathResolver,
  toPosixPath,
  type RelativePathResolver,
} from './pathHelpers.ts';

const defaultIgnoredDirNames = new Set([
  '.git',
  '.sl',
  '.svn',
  '.hg',
  '.jj',
  '.rstack',
  'node_modules',
]);

const ignored = Symbol('ignored');
type IgnoredDirent = Dirent & { [ignored]?: true };
type TraversalIgnorePredicate = ((
  filePath: string,
  isDirectory: boolean,
) => boolean) &
  Pick<IgnoreMatcher, 'batch'>;

interface GitIgnoreBatchContext {
  readonly matcher: NativeGitIgnoreMatcher;
  readonly relativeParent: string;
}

interface DiscoverFmtPathsOptions {
  /** Absolute directory used to resolve input paths. */
  cwd: string;
  patterns?: string[];
  /** Whether files inside node_modules may be discovered. */
  withNodeModules?: boolean;
  /** Returns whether a candidate path should be excluded. */
  isIgnored?: TraversalIgnorePredicate;
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

/** Supports both the legacy tiny-readdir type and Node.js 24 Dirent. */
const getDirentParentPath = (dirent: Dirent): string =>
  (dirent as Dirent & { parentPath?: string }).parentPath ?? dirent.path;

const hasBuiltInIgnoredSegment = (
  cwd: string,
  filePath: string,
  ignoredDirNames: ReadonlySet<string>,
): boolean =>
  path
    .relative(cwd, filePath)
    .split(path.sep)
    .some((segment) => ignoredDirNames.has(segment));

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

/** Loads repository ignore files while Rust owns their compiled matching state. */
class GitIgnoreFiles {
  readonly #rootPath: string;
  readonly #resolveRelativePath: RelativePathResolver;
  readonly #loads = new Map<string, Promise<void>>();
  #matcher: NativeGitIgnoreMatcher | undefined;
  #hasRules = false;

  private constructor(rootPath: string) {
    this.#rootPath = rootPath;
    this.#resolveRelativePath = createRelativePathResolver(rootPath);
  }

  static async create(cwd: string): Promise<GitIgnoreFiles> {
    const matcher = new GitIgnoreFiles(await findGitRoot(cwd));
    await matcher.loadThrough(cwd);
    return matcher;
  }

  async loadThrough(directoryPath: string): Promise<void> {
    const relativePath = this.#resolveRelativePath(directoryPath);
    if (!isRelativePathInside(relativePath)) {
      return;
    }

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
    if (isRelativePathInside(this.#resolveRelativePath(directoryPath))) {
      await this.#load(directoryPath);
    }
  }

  isIgnored(filePath: string, isDirectory: boolean): boolean {
    if (!this.#hasRules) {
      return false;
    }

    const relativePath = this.#resolveRelativePath(filePath);
    if (relativePath === '' || !isRelativePathInside(relativePath)) {
      return false;
    }

    return this.#matcher!.isIgnored(toPosixPath(relativePath), isDirectory);
  }

  resolveBatchContext(parentPath: string): GitIgnoreBatchContext | undefined {
    if (!this.#hasRules) {
      return;
    }

    const relativeParent = this.#resolveRelativePath(parentPath);
    if (!isRelativePathInside(relativeParent)) {
      return;
    }

    return {
      matcher: this.#matcher!,
      relativeParent: toPosixPath(relativeParent),
    };
  }

  #load(directoryPath: string): Promise<void> {
    const cached = this.#loads.get(directoryPath);
    if (cached) {
      return cached;
    }

    // Ignore files may disappear or become unreadable during traversal.
    const loading = readFile(
      path.join(directoryPath, '.gitignore'),
      'utf8',
    ).then(
      (content) => {
        const relativePath = toPosixPath(
          this.#resolveRelativePath(directoryPath),
        );
        this.#matcher ??= new (loadNativeBinding().GitIgnoreMatcher)();
        this.#hasRules = this.#matcher.addSource(relativePath, content);
      },
      () => undefined,
    );

    this.#loads.set(directoryPath, loading);
    return loading;
  }
}

const isIgnoredBeforeNative = (
  parentPath: string,
  dirent: Dirent,
  ignoredDirNames: ReadonlySet<string>,
  isIncluded: ((filePath: string) => boolean) | undefined,
  precheck: IgnorePredicate | undefined,
): boolean => {
  if (ignoredDirNames.has(dirent.name)) {
    return true;
  }

  const isDirectory = dirent.isDirectory();
  let targetPath: string | undefined;
  if (!isDirectory && isIncluded) {
    targetPath = path.join(parentPath, dirent.name);
    if (!isIncluded(targetPath)) {
      return true;
    }
  }
  if (!isDirectory && isBinaryPath(dirent.name)) {
    return true;
  }

  return (
    precheck?.(
      targetPath ?? path.join(parentPath, dirent.name),
      isDirectory,
    ) === true
  );
};

/** Matches one directory after earlier traversal rules have removed candidates. */
const markIgnoredDirents = (
  parentPath: string,
  dirents: Dirent[],
  gitIgnore: GitIgnoreFiles,
  ignoredDirNames: ReadonlySet<string>,
  isIncluded: ((filePath: string) => boolean) | undefined,
  batchIgnore?: BatchIgnoreContext,
): void => {
  const gitIgnoreContext = gitIgnore.resolveBatchContext(parentPath);

  if (dirents.length === 1) {
    const dirent = dirents[0];
    if (
      gitIgnoreContext?.matcher.isIgnoredChild(
        gitIgnoreContext.relativeParent,
        dirent.name,
        dirent.isDirectory(),
      ) === true ||
      isIgnoredBeforeNative(
        parentPath,
        dirent,
        ignoredDirNames,
        isIncluded,
        batchIgnore?.precheck,
      ) ||
      batchIgnore?.matcher.isIgnoredChild(
        parentPath,
        dirent.name,
        dirent.isDirectory(),
      ) === true
    ) {
      (dirent as IgnoredDirent)[ignored] = true;
    }
    return;
  }

  const names = new Array<string>(dirents.length);

  if (dirents.length <= 32) {
    let directoryMask = 0;
    for (let index = 0; index < dirents.length; index++) {
      const dirent = dirents[index];
      names[index] = dirent.name;
      directoryMask |= Number(dirent.isDirectory()) << index;
    }

    let ignoredMask = gitIgnoreContext
      ? gitIgnoreContext.matcher.isIgnoredBatchMask(
          gitIgnoreContext.relativeParent,
          names,
          directoryMask >>> 0,
        )
      : 0;

    if (batchIgnore) {
      for (let index = 0; index < dirents.length; index++) {
        const entryMask = 1 << index;
        if (
          (ignoredMask & entryMask) === 0 &&
          isIgnoredBeforeNative(
            parentPath,
            dirents[index],
            ignoredDirNames,
            isIncluded,
            batchIgnore.precheck,
          )
        ) {
          ignoredMask |= entryMask;
        }
      }

      const validMask = 0xffffffff >>> (32 - dirents.length);
      const candidateMask = (validMask & ~ignoredMask) >>> 0;
      if (candidateMask !== 0) {
        ignoredMask =
          (ignoredMask |
            batchIgnore.matcher.isIgnoredBatchMask(
              parentPath,
              names,
              directoryMask >>> 0,
              candidateMask,
            )) >>>
          0;
      }
    }

    for (let index = 0; index < dirents.length; index++) {
      if ((ignoredMask & (1 << index)) !== 0) {
        (dirents[index] as IgnoredDirent)[ignored] = true;
      }
    }
    return;
  }

  const directoryFlags = new Uint8Array(dirents.length);
  for (let index = 0; index < dirents.length; index++) {
    const dirent = dirents[index];
    names[index] = dirent.name;
    directoryFlags[index] = Number(dirent.isDirectory());
  }

  const ignoredFlags = gitIgnoreContext
    ? gitIgnoreContext.matcher.isIgnoredBatch(
        gitIgnoreContext.relativeParent,
        names,
        directoryFlags,
      )
    : new Uint8Array(dirents.length);

  if (batchIgnore) {
    const candidateFlags = new Uint8Array(dirents.length);
    let candidateCount = 0;
    for (let index = 0; index < dirents.length; index++) {
      if (ignoredFlags[index] === 0) {
        if (
          isIgnoredBeforeNative(
            parentPath,
            dirents[index],
            ignoredDirNames,
            isIncluded,
            batchIgnore.precheck,
          )
        ) {
          ignoredFlags[index] = 1;
        } else {
          candidateFlags[index] = 1;
          candidateCount++;
        }
      }
    }

    if (candidateCount !== 0) {
      const nextIgnored = batchIgnore.matcher.isIgnoredBatch(
        parentPath,
        names,
        directoryFlags,
        candidateFlags,
      );
      for (let index = 0; index < dirents.length; index++) {
        ignoredFlags[index] |= nextIgnored[index];
      }
    }
  }

  for (let index = 0; index < dirents.length; index++) {
    if (ignoredFlags[index] !== 0) {
      (dirents[index] as IgnoredDirent)[ignored] = true;
    }
  }
};

const createTraversalOptions = (
  gitIgnore: GitIgnoreFiles,
  ignoredDirNames: ReadonlySet<string>,
  signal: { aborted: boolean },
  onError: (error: unknown) => void,
  isIncluded?: (filePath: string) => boolean,
  isIgnored?: TraversalIgnorePredicate,
) => {
  const batchIgnore = isIgnored?.batch;
  const scalarIgnore = batchIgnore ? undefined : isIgnored;

  return {
    followSymlinks: false,
    signal,
    ignore: (targetPath: string, targetContext: DirentLike) => {
      // With symlink following disabled, tiny-readdir always provides a Dirent here.
      const dirent = targetContext as Dirent;
      if (
        (dirent as IgnoredDirent)[ignored] === true ||
        ignoredDirNames.has(dirent.name)
      ) {
        return true;
      }

      if (batchIgnore) {
        return false;
      }

      if (dirent.isDirectory()) {
        return scalarIgnore?.(targetPath, true) === true;
      }

      if (isIncluded !== undefined && !isIncluded(targetPath)) {
        return true;
      }

      return (
        scalarIgnore?.(targetPath, false) === true || isBinaryPath(targetPath)
      );
    },
    onDirents: async (dirents: Dirent[]) => {
      try {
        const parentPath = getDirentParentPath(dirents[0]);
        let hasGitIgnore = false;

        for (const dirent of dirents) {
          if (dirent.name === '.gitignore') {
            hasGitIgnore = true;
          }
        }

        if (hasGitIgnore) {
          await gitIgnore.load(parentPath);
        }

        markIgnoredDirents(
          parentPath,
          dirents,
          gitIgnore,
          ignoredDirNames,
          isIncluded,
          batchIgnore,
        );
      } catch (error) {
        onError(error);
      }

      return undefined;
    },
  };
};

const discoverDirectoryFiles = async (
  rootPath: string,
  gitIgnore: GitIgnoreFiles,
  ignoredDirNames: ReadonlySet<string>,
  isIncluded?: (filePath: string) => boolean,
  isIgnored?: TraversalIgnorePredicate,
): Promise<string[]> => {
  let failed = false;
  let failure: unknown;
  const signal = { aborted: false };
  const onError = (error: unknown): void => {
    if (!failed) {
      failed = true;
      failure = error;
    }
    signal.aborted = true;
  };

  const result = await readdir(
    rootPath,
    createTraversalOptions(
      gitIgnore,
      ignoredDirNames,
      signal,
      onError,
      isIncluded,
      isIgnored,
    ),
  );

  // tiny-readdir only handles fulfilled onDirents promises, so rethrow after its counter settles.
  if (failed) {
    throw failure;
  }

  return result.files;
};

const normalizeGlob = (cwd: string, pattern: string): string => {
  const relativePattern = path.isAbsolute(pattern)
    ? path.relative(cwd, pattern)
    : pattern;
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

const classifyPatterns = async (
  cwd: string,
  patterns: string[],
  ignoredDirNames: ReadonlySet<string>,
): Promise<ClassifiedPatterns> => {
  const entries = await Promise.all(
    patterns.map(async (pattern): Promise<PatternEntry | undefined> => {
      if (pattern.startsWith('!')) {
        return {
          kind: 'negative-glob',
          value: normalizeGlob(cwd, pattern.slice(1)),
        };
      }

      const filePath = path.resolve(cwd, pattern);
      if (hasBuiltInIgnoredSegment(cwd, filePath, ignoredDirNames)) {
        return;
      }

      const stats = await lstatSafe(filePath);
      if (stats?.isFile()) {
        return isBinaryPath(filePath)
          ? undefined
          : { kind: 'file', value: filePath };
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
  const sortedPaths = [...new Set(paths)].sort(
    (left, right) => left.length - right.length,
  );
  const outermostPaths: string[] = [];

  for (const filePath of sortedPaths) {
    if (
      !outermostPaths.some((parentPath) => isPathInside(parentPath, filePath))
    ) {
      outermostPaths.push(filePath);
    }
  }

  return outermostPaths;
};

/** Merges overlapping roots; micromatch remains responsible for glob syntax. */
const getTraversalRoots = (
  cwd: string,
  directories: string[],
  globs: string[],
): string[] => {
  const globRoots = globs.map((pattern) =>
    path.resolve(cwd, micromatch.scan(pattern).base || '.'),
  );

  return getOutermostPaths([...directories, ...globRoots]);
};

const discoverFmtPaths = async ({
  cwd,
  patterns: inputPatterns,
  withNodeModules = false,
  isIgnored,
}: DiscoverFmtPathsOptions): Promise<string[]> => {
  const patterns = inputPatterns?.length ? inputPatterns : ['.'];
  const resolveRelativePath = createRelativePathResolver(cwd);
  const ignoredDirNames = withNodeModules
    ? new Set(defaultIgnoredDirNames)
    : defaultIgnoredDirNames;

  if (withNodeModules) {
    ignoredDirNames.delete('node_modules');
  }

  const {
    files: explicitFiles,
    directories,
    globs,
    negativeGlobs,
  } = await classifyPatterns(cwd, patterns, ignoredDirNames);
  const directoryRoots = getOutermostPaths(directories);
  const globMatchers = globs.map((pattern) =>
    micromatch.matcher(pattern, { dot: true }),
  );
  const candidates = new Set(
    isIgnored
      ? explicitFiles.filter((filePath) => !isIgnored(filePath, false))
      : explicitFiles,
  );
  const traversalRoots = getTraversalRoots(cwd, directoryRoots, globs);

  if (traversalRoots.length) {
    const gitIgnore = await GitIgnoreFiles.create(cwd);
    const results = await Promise.all(
      traversalRoots.map(async (rootPath) => {
        const stats = await lstatSafe(rootPath);
        if (!stats?.isDirectory()) {
          return [];
        }

        await gitIgnore.loadThrough(rootPath);
        if (
          gitIgnore.isIgnored(rootPath, true) ||
          isIgnored?.(rootPath, true) === true
        ) {
          return [];
        }

        const includesAll = directoryRoots.some((directoryPath) =>
          isPathInside(directoryPath, rootPath),
        );
        const isIncluded = includesAll
          ? undefined
          : (filePath: string): boolean => {
              if (
                directoryRoots.some((directoryPath) =>
                  isPathInside(directoryPath, filePath),
                )
              ) {
                return true;
              }

              const relativePath = toPosixPath(resolveRelativePath(filePath));
              return globMatchers.some((matches) => matches(relativePath));
            };

        return discoverDirectoryFiles(
          rootPath,
          gitIgnore,
          ignoredDirNames,
          isIncluded,
          isIgnored,
        );
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
    if (negativeGlobMatchers.length) {
      const relativePath = toPosixPath(resolveRelativePath(filePath));
      if (negativeGlobMatchers.some((matches) => matches(relativePath))) {
        continue;
      }
    }

    filePaths.push(filePath);
  }

  return filePaths.sort();
};

export { discoverFmtPaths };
