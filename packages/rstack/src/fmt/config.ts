import { dirname } from 'node:path';
import type { FmtConfig, FmtConfigDefinition, ResolvedFmtConfig } from './types.ts';

type ResolveFmtConfigOptions = {
  definition: FmtConfigDefinition | undefined;
  configFilePath: string | null;
  cwd: string;
};

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

/** Resolves a formatter config definition and its project root. */
const resolveFmtConfig = async ({
  definition,
  configFilePath,
  cwd,
}: ResolveFmtConfigOptions): Promise<ResolvedFmtConfig> => {
  const config = typeof definition === 'function' ? await definition() : definition;
  const rootPath = configFilePath ? dirname(configFilePath) : cwd;

  return normalizeFmtConfig(config, rootPath);
};

export { normalizeFmtConfig, resolveFmtConfig };
