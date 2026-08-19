import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cacheGitignore = '*\n';

type ProjectCacheResult =
  | { status: 'available'; path: string }
  | { status: 'unavailable'; path: string; error: unknown };

/** Returns the disposable cache directory for a resolved Rstack project root. */
const getProjectCacheDir = (rootPath: string): string =>
  path.join(rootPath, '.rstack', 'cache');

/** Creates the project cache directory without making cache failures fatal. */
const ensureProjectCacheDir = async (
  rootPath: string,
): Promise<ProjectCacheResult> => {
  const cachePath = getProjectCacheDir(rootPath);
  const ignorePath = path.join(cachePath, '.gitignore');

  try {
    if ((await readFile(ignorePath, 'utf8')) === cacheGitignore) {
      return { status: 'available', path: cachePath };
    }
  } catch {
    // Create or repair the marker below.
  }

  try {
    await mkdir(cachePath, { recursive: true });
    await writeFile(ignorePath, cacheGitignore);
    return { status: 'available', path: cachePath };
  } catch (error) {
    return { status: 'unavailable', path: cachePath, error };
  }
};

export { ensureProjectCacheDir, getProjectCacheDir };
export type { ProjectCacheResult };
