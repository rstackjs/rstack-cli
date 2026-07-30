import { relative } from 'node:path';
import fastIgnore from 'fast-ignore';
import type { ResolvedFmtConfig } from './types.ts';

/** Creates a reusable matcher for config-level ignore patterns. */
const createFmtIgnoreMatcher = (config: ResolvedFmtConfig): ((filePath: string) => boolean) => {
  const matches = fastIgnore(config.ignorePatterns.join('\n'));

  return (filePath) => matches(relative(config.rootPath, filePath));
};

export { createFmtIgnoreMatcher };
