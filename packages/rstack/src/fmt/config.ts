import type { FmtConfig, ResolvedFmtConfig } from './types.ts';

/** Splits a flat config into project-level formatting options and rules. */
const normalizeFmtConfig = (config: FmtConfig | undefined, rootPath: string): ResolvedFmtConfig => {
  const { ignorePatterns = [], overrides = [], ...baseOptions } = config ?? {};

  return {
    rootPath,
    baseOptions,
    overrides,
    ignorePatterns,
  };
};

export { normalizeFmtConfig };
