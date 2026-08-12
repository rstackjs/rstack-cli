import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { IgnoreSource } from '../../binding.cjs';
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

interface CreateIgnoreMatcherOptions {
  config: ResolvedFmtConfig;
  /** Base directory for relative ignore paths. */
  cwd: string;
  ignorePaths?: string[];
}

const createDefaultMatcher = (): IgnorePredicate => {
  const suffixes = defaultIgnoreNames.map((name) => `${path.sep}${name}`);

  return (filePath) => suffixes.some((suffix) => filePath.endsWith(suffix));
};

const createSourceMatcher = (sources: IgnoreSource[]): IgnorePredicate => {
  const matcher = new (loadNativeBinding().IgnoreMatcher)(sources);
  return (filePath, isDirectory = false) => matcher.isIgnored(filePath, isDirectory);
};

const loadIgnoreSource = async (cwd: string, ignorePath: string): Promise<IgnoreSource> => {
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
}: CreateIgnoreMatcherOptions): Promise<IgnorePredicate> => {
  const ignoreFileSources = await Promise.all(
    ignorePaths.map((ignorePath) => loadIgnoreSource(cwd, ignorePath)),
  );
  if (config.ignorePatterns.length) {
    return createSourceMatcher([
      {
        rootPath: config.rootPath,
        patterns: [...defaultIgnoreNames, ...config.ignorePatterns].join('\n'),
      },
      ...ignoreFileSources,
    ]);
  }

  const defaultMatcher = createDefaultMatcher();
  if (ignoreFileSources.length === 0) {
    return defaultMatcher;
  }

  const cliMatcher = createSourceMatcher(ignoreFileSources);
  return (filePath, isDirectory = false) =>
    defaultMatcher(filePath, isDirectory) || cliMatcher(filePath, isDirectory);
};

export { createIgnoreMatcher };
export type { IgnorePredicate };
