import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { styleText } from 'node:util';

export type DistFiles = Record<string, string>;
export type FileMatcher = string | RegExp | ((file: string) => boolean);
export type FindFileOptions = {
  ignoreHash?: boolean;
};

const HASH_PATTERN = /\.[0-9a-z]{8,}(?=\.)/gi;

const toPosixPath = (filePath: string) => filePath.replace(/\\/g, '/');

const toMatcherFn = (matcher: FileMatcher): ((file: string) => boolean) => {
  if (typeof matcher === 'function') {
    return matcher;
  }
  if (typeof matcher === 'string') {
    return (file) => file.endsWith(toPosixPath(matcher));
  }
  return (file) => matcher.test(file);
};

export const getDistFiles = async (distPath: string, sourceMaps = false): Promise<DistFiles> => {
  const files: DistFiles = {};
  const root = path.resolve(distPath);

  const readDir = async (dir: string) => {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    await Promise.all(
      entries.map(async (entry) => {
        const filePath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await readDir(filePath);
          return;
        }
        if (!entry.isFile() || (!sourceMaps && filePath.endsWith('.map'))) {
          return;
        }

        files[toPosixPath(filePath)] = await readFile(filePath, 'utf-8');
      }),
    );
  };

  await readDir(root);
  return files;
};

export const findFile = (
  files: DistFiles,
  matcher: FileMatcher,
  options: FindFileOptions = {},
): string => {
  const { ignoreHash = true } = options;
  const matcherFn = toMatcherFn(matcher);

  for (const file of Object.keys(files).sort()) {
    const comparable = ignoreHash ? file.replace(HASH_PATTERN, '') : file;

    if (matcherFn(comparable)) {
      return file;
    }
  }

  throw new Error(`Unable to find file matching "${styleText('cyan', matcher.toString())}"`);
};

export const getFileContent = (
  files: DistFiles,
  matcher: FileMatcher,
  options?: FindFileOptions,
): string => files[findFile(files, matcher, options)];
