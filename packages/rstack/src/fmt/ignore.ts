import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  IgnoreMatcher as NativeIgnoreMatcher,
  IgnoreSource,
} from '../../binding.cjs';
import { loadNativeBinding } from '../native/index.ts';
import type { ResolvedFmtConfig } from './types.ts';

/**
 * Common lock files that Prettier can format but `rs fmt` leaves to package managers.
 *
 * Prettier already skips other generated lock files when it cannot infer a parser, so this list
 * contains only the additional defaults owned by `rs fmt`.
 */
const defaultIgnoreNames = ['package-lock.json', 'pnpm-lock.yaml'];

type IgnorePredicate = (filePath: string, isDirectory?: boolean) => boolean;

type BatchIgnoreMatcher = Pick<
  NativeIgnoreMatcher,
  'isIgnoredBatch' | 'isIgnoredBatchMask' | 'isIgnoredChild'
>;

interface BatchIgnoreContext {
  readonly matcher: BatchIgnoreMatcher;
  /** Cheap JavaScript checks applied before crossing into the native matcher. */
  readonly precheck?: IgnorePredicate;
}

type IgnoreMatcher = IgnorePredicate & {
  readonly batch?: BatchIgnoreContext;
};

interface CreateIgnoreMatcherOptions {
  config: ResolvedFmtConfig;
  /** Base directory for relative ignore paths. */
  cwd: string;
  ignorePaths?: string[];
  precheck?: IgnorePredicate;
}

const createDefaultMatcher = (): IgnoreMatcher => {
  const suffixes = defaultIgnoreNames.map((name) => `${path.sep}${name}`);

  return (filePath) => suffixes.some((suffix) => filePath.endsWith(suffix));
};

const combineIgnorePredicates = (
  first: IgnorePredicate,
  second: IgnorePredicate,
): IgnorePredicate => {
  return (filePath, isDirectory = false) =>
    first(filePath, isDirectory) || second(filePath, isDirectory);
};

const createSourceMatcher = (
  sources: IgnoreSource[],
  precheck?: IgnorePredicate,
): IgnoreMatcher => {
  const matcher = new (loadNativeBinding().IgnoreMatcher)(sources);
  const isIgnored: IgnorePredicate = precheck
    ? (filePath, isDirectory = false) =>
        precheck(filePath, isDirectory) ||
        matcher.isIgnored(filePath, isDirectory)
    : (filePath, isDirectory = false) =>
        matcher.isIgnored(filePath, isDirectory);

  return Object.assign(
    isIgnored,
    precheck ? { batch: { matcher, precheck } } : { batch: { matcher } },
  );
};

const loadIgnoreSource = async (
  cwd: string,
  ignorePath: string,
): Promise<IgnoreSource> => {
  const filePath = path.resolve(cwd, ignorePath);
  let patterns: string;

  try {
    patterns = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read ignore file "${ignorePath}".`, {
      cause: error,
    });
  }

  return {
    rootPath: path.dirname(filePath),
    patterns,
  };
};

/** Creates a reusable matcher for default, config-level, and CLI-provided ignore patterns. */
const createIgnoreMatcher = async ({
  config,
  cwd,
  ignorePaths = [],
  precheck,
}: CreateIgnoreMatcherOptions): Promise<IgnoreMatcher> => {
  const ignoreFileSources = await Promise.all(
    ignorePaths.map((ignorePath) => loadIgnoreSource(cwd, ignorePath)),
  );
  if (config.ignorePatterns.length) {
    return createSourceMatcher(
      [
        {
          rootPath: config.rootPath,
          patterns: [...defaultIgnoreNames, ...config.ignorePatterns].join(
            '\n',
          ),
        },
        ...ignoreFileSources,
      ],
      precheck,
    );
  }

  const defaultMatcher = createDefaultMatcher();
  const matcher = precheck
    ? combineIgnorePredicates(precheck, defaultMatcher)
    : defaultMatcher;
  if (ignoreFileSources.length === 0) {
    return matcher;
  }

  return createSourceMatcher(ignoreFileSources, matcher);
};

export { createIgnoreMatcher };
export type { BatchIgnoreContext, IgnoreMatcher, IgnorePredicate };
