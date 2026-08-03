import { relative } from 'node:path';
import fastIgnore from 'fast-ignore';
import type { ResolvedFmtConfig } from './types.ts';

/**
 * Common lock files that Prettier can format but `rs fmt` leaves to package managers.
 *
 * Prettier already skips other generated lock files when it cannot infer a parser, so this list
 * contains only the additional defaults owned by `rs fmt`.
 */
const defaultIgnorePatterns = ['package-lock.json', 'pnpm-lock.yaml'];

/** Creates a reusable matcher for default and config-level ignore patterns. */
const createFmtIgnoreMatcher = (config: ResolvedFmtConfig): ((filePath: string) => boolean) => {
  const matches = fastIgnore([...defaultIgnorePatterns, ...config.ignorePatterns].join('\n'));

  return (filePath) => matches(relative(config.rootPath, filePath));
};

export { createFmtIgnoreMatcher };
