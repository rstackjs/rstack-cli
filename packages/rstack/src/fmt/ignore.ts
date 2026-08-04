import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fastIgnore from 'fast-ignore';
import type { ResolvedFmtConfig } from './types.ts';

/**
 * Common lock files that Prettier can format but `rs fmt` leaves to package managers.
 *
 * Prettier already skips other generated lock files when it cannot infer a parser, so this list
 * contains only the additional defaults owned by `rs fmt`.
 */
const defaultIgnorePatterns = ['package-lock.json', 'pnpm-lock.yaml'];

type IgnoreMatcher = (filePath: string) => boolean;

interface CreateIgnoreMatcherOptions {
  config: ResolvedFmtConfig;
  /** Base directory for relative ignore paths. */
  cwd: string;
  ignorePaths?: string[];
}

const createPatternMatcher = (rootPath: string, patterns: string): IgnoreMatcher => {
  const matches = fastIgnore(patterns);

  return (filePath) => matches(path.relative(rootPath, filePath));
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

  return (filePath) =>
    configMatcher(filePath) || ignoreMatchers.some((matches) => matches(filePath));
};

export { createIgnoreMatcher };
