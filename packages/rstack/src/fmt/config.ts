import { dirname } from 'node:path';
import micromatch from 'micromatch';
import { createRelativePathResolver } from './pathHelpers.ts';
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

type PathMatcher = (filePath: string) => boolean;
type FmtOptionsResolver = (filePath: string) => ResolvedFmtOptions;

/**
 * Each path from the root represents an ordered sequence of matching overrides.
 * A node stores the options merged along that path.
 */
type OptionsCacheNode = {
  children: WeakMap<ResolvedFmtOptions, OptionsCacheNode>;
  options: ResolvedFmtOptions;
};

const createOptionsCacheNode = (options: ResolvedFmtOptions): OptionsCacheNode => ({
  children: new WeakMap(),
  options,
});

const neverMatches: PathMatcher = () => false;

const compileMatchers = (
  patterns: string[],
  excludedPatterns: string | string[] | undefined,
  basename: boolean,
): PathMatcher | undefined => {
  if (patterns.length === 0) {
    return;
  }

  const options = {
    ignore: excludedPatterns,
    basename,
    dot: true,
  };

  if (patterns.length === 1) {
    return micromatch.matcher(patterns[0], options);
  }

  const matchers = patterns.map((pattern) => micromatch.matcher(pattern, options));

  return (filePath) => {
    for (const matches of matchers) {
      if (matches(filePath)) {
        return true;
      }
    }
    return false;
  };
};

const createPathMatcher = (
  patterns: string | string[],
  excludedPatterns?: string | string[],
): PathMatcher => {
  const pathPatterns: string[] = [];
  const basenamePatterns: string[] = [];

  for (const pattern of Array.isArray(patterns) ? patterns : [patterns]) {
    if (pattern.includes('/')) {
      pathPatterns.push(pattern);
    } else {
      basenamePatterns.push(pattern);
    }
  }

  const basenameMatcher = compileMatchers(basenamePatterns, excludedPatterns, true);
  const pathMatcher = compileMatchers(pathPatterns, excludedPatterns, false);

  if (!basenameMatcher || !pathMatcher) {
    return basenameMatcher ?? pathMatcher ?? neverMatches;
  }
  return (filePath) => basenameMatcher(filePath) || pathMatcher(filePath);
};

/** Splits a flat config into project-level formatting options and rules. */
const normalizeFmtConfig = (config: FmtConfig | undefined, rootPath: string): ResolvedFmtConfig => {
  const { ignorePatterns = [], overrides = [], ...baseOptions } = config ?? {};

  return {
    rootPath,
    baseOptions,
    overrides: overrides.map(({ files, excludeFiles, options }) => ({
      matches: createPathMatcher(files, excludeFiles),
      options,
    })),
    ignorePatterns,
  };
};

/** Creates a reusable resolver for applying per-file formatter overrides. */
const createOptionsResolver = (config: ResolvedFmtConfig): FmtOptionsResolver => {
  if (config.overrides.length === 0) {
    return () => config.baseOptions;
  }

  const resolveRelativePath = createRelativePathResolver(config.rootPath);
  const rootCacheNode = createOptionsCacheNode(config.baseOptions);

  return (filePath) => {
    let cacheNode = rootCacheNode;
    const relativeFilePath = resolveRelativePath(filePath);

    for (const override of config.overrides) {
      if (!override.options || !override.matches(relativeFilePath)) {
        continue;
      }

      // Reuse the merged result for this override after the current matched sequence.
      let nextCacheNode = cacheNode.children.get(override.options);
      if (!nextCacheNode) {
        nextCacheNode = createOptionsCacheNode({ ...cacheNode.options, ...override.options });
        cacheNode.children.set(override.options, nextCacheNode);
      }
      cacheNode = nextCacheNode;
    }

    return cacheNode.options;
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

export { createOptionsResolver, normalizeFmtConfig, resolveFmtConfig };
export type { FmtOptionsResolver };
