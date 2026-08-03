import { dirname, relative } from 'node:path';
import micromatch from 'micromatch';
import type {
  FmtConfig,
  FmtConfigDefinition,
  ResolvedFmtConfig,
  ResolvedFmtOptions,
} from './types.ts';

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

const pathMatchesGlobs = (
  filePath: string,
  patterns: string | string[],
  excludedPatterns?: string | string[],
): boolean => {
  const patternList = Array.isArray(patterns) ? patterns : [patterns];
  const withSlashes = patternList.filter((pattern) => pattern.includes('/'));
  const withoutSlashes = patternList.filter((pattern) => !pattern.includes('/'));

  return (
    micromatch.isMatch(filePath, withoutSlashes, {
      ignore: excludedPatterns,
      basename: true,
      dot: true,
    }) ||
    micromatch.isMatch(filePath, withSlashes, {
      ignore: excludedPatterns,
      basename: false,
      dot: true,
    })
  );
};

/** Applies matching overrides to the shared formatter options. */
const resolveFmtOptions = (filePath: string, config: ResolvedFmtConfig): ResolvedFmtOptions => {
  if (config.overrides.length === 0) {
    return config.baseOptions;
  }

  const options = { ...config.baseOptions };
  const relativeFilePath = relative(config.rootPath, filePath);

  for (const override of config.overrides) {
    if (pathMatchesGlobs(relativeFilePath, override.files, override.excludeFiles)) {
      Object.assign(options, override.options);
    }
  }

  return options;
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

export { normalizeFmtConfig, resolveFmtConfig, resolveFmtOptions };
