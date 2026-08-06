import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { ensureProjectCacheDir, getProjectCacheDir } from '../src/projectCache.ts';
import { withTempProject, writeProjectFile } from './fmt/helpers.ts';

test('creates and repairs an ignored project cache only when requested', async () => {
  await withTempProject(async (rootPath) => {
    const cachePath = getProjectCacheDir(rootPath);
    const ignorePath = path.join(cachePath, '.gitignore');

    expect(cachePath).toBe(path.join(rootPath, '.rstack', 'cache'));
    expect(existsSync(cachePath)).toBe(false);

    await expect(ensureProjectCacheDir(rootPath)).resolves.toEqual({
      status: 'available',
      path: cachePath,
    });
    expect(readFileSync(ignorePath, 'utf8')).toBe('*\n');

    writeFileSync(ignorePath, 'stale\n');
    await ensureProjectCacheDir(rootPath);
    expect(readFileSync(ignorePath, 'utf8')).toBe('*\n');
  });
});

test('reports an unavailable project cache without throwing', async () => {
  await withTempProject(async (rootPath) => {
    writeProjectFile(rootPath, '.rstack', 'not a directory');

    const result = await ensureProjectCacheDir(rootPath);

    expect(result).toMatchObject({
      status: 'unavailable',
      path: getProjectCacheDir(rootPath),
    });
  });
});
