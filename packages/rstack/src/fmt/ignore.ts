import { readFile } from 'node:fs/promises';
import path from 'node:path';
import createIgnore from 'ignore';
import type { ResolvedFmtConfig } from './types.ts';

/**
 * Common lock files that Prettier can format but `rs fmt` leaves to package managers.
 *
 * Prettier already skips other generated lock files when it cannot infer a parser, so this list
 * contains only the additional defaults owned by `rs fmt`.
 */
const defaultIgnorePatterns = ['package-lock.json', 'pnpm-lock.yaml'];

type IgnoreMatcher = (filePath: string, isDirectory?: boolean) => boolean;

interface CreateIgnoreMatcherOptions {
  config: ResolvedFmtConfig;
  /** Base directory for relative ignore paths. */
  cwd: string;
  ignorePaths?: string[];
}

const createPatternMatcher = (rootPath: string, patterns: string): IgnoreMatcher => {
  const matcher = createIgnore({ allowRelativePaths: true }).add(patterns);
  const rootPrefix = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;

  return (filePath, isDirectory = false) => {
    const relativePath = filePath.startsWith(rootPrefix)
      ? filePath.slice(rootPrefix.length)
      : path.relative(rootPath, filePath);
    if (relativePath === '') {
      return false;
    }

    const posixPath = path.sep === '\\' ? relativePath.replaceAll('\\', '/') : relativePath;
    return matcher.ignores(isDirectory ? `${posixPath}/` : posixPath);
  };
};

const loadIgnoreMatcher = async (cwd: string, ignorePath: string): Promise<IgnoreMatcher> => {
  const filePath = path.resolve(cwd, ignorePath);
  let patterns: string;

  try {
    patterns = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read ignore file "${ignorePath}".`, {
      cause: error,
    });
  }

  return createPatternMatcher(path.dirname(filePath), patterns);
};

/** Creates a reusable matcher for default, config-level, and CLI-provided ignore patterns. */
const createIgnoreMatcher = async ({
  config,
  cwd,
  ignorePaths = [],
}: CreateIgnoreMatcherOptions): Promise<IgnoreMatcher> => {
  const configMatcher = createPatternMatcher(
    config.rootPath,
    [...defaultIgnorePatterns, ...config.ignorePatterns].join('\n'),
  );
  const ignoreMatchers = await Promise.all(
    ignorePaths.map((ignorePath) => loadIgnoreMatcher(cwd, ignorePath)),
  );

  return (filePath, isDirectory = false) =>
    configMatcher(filePath, isDirectory) ||
    ignoreMatchers.some((matches) => matches(filePath, isDirectory));
};

export { createIgnoreMatcher };
