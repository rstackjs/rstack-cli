import { getFileInfo, type FileInfoOptions } from 'prettier';
import { resolveFmtOptions } from './config.ts';
import { discoverFmtPaths } from './discoverPaths.ts';
import { createFmtIgnoreMatcher } from './ignore.ts';
import type { DiscoverFmtFilesOptions, FmtFileRequest, ResolvedFmtConfig } from './types.ts';

const fileInfoOptions = {
  ignorePath: [],
  resolveConfig: false,
  withNodeModules: true,
} satisfies FileInfoOptions;

const resolveFileRequest = async (
  filePath: string,
  config: ResolvedFmtConfig,
): Promise<FmtFileRequest | undefined> => {
  const options = resolveFmtOptions(filePath, config);

  if (options.plugins?.length) {
    throw new Error('Prettier plugins are not supported yet.');
  }

  const parser = options.parser ?? (await getFileInfo(filePath, fileInfoOptions)).inferredParser;
  if (!parser) {
    return;
  }

  return {
    path: filePath,
    options: {
      ...options,
      filepath: filePath,
      parser,
    },
  };
};

/** Discovers format-ready files without reading Prettier config files or `.prettierignore`. */
const discoverFmtFiles = async ({
  cwd,
  patterns,
  config,
}: DiscoverFmtFilesOptions): Promise<FmtFileRequest[]> => {
  const candidates = await discoverFmtPaths({ cwd, patterns });
  if (candidates.length === 0) {
    return [];
  }

  const isFmtIgnored = config.ignorePatterns.length ? createFmtIgnoreMatcher(config) : undefined;
  const filePaths = isFmtIgnored
    ? candidates.filter((filePath) => !isFmtIgnored(filePath))
    : candidates;
  const files = await Promise.all(
    filePaths.map((filePath) => resolveFileRequest(filePath, config)),
  );

  return files.filter((file): file is FmtFileRequest => file !== undefined);
};

export { discoverFmtFiles };
