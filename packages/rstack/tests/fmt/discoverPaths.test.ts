import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { discoverFmtPaths } from '../../src/fmt/discoverPaths.ts';

const withProject = async (callback: (rootPath: string) => Promise<void>): Promise<void> => {
  const rootPath = mkdtempSync(path.join(tmpdir(), 'rstack fmt '));

  try {
    await callback(rootPath);
  } finally {
    rmSync(rootPath, { force: true, recursive: true });
  }
};

const writeProjectFile = (rootPath: string, filePath: string, content = ''): string => {
  const absolutePath = path.join(rootPath, filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  return absolutePath;
};

const relativePaths = (rootPath: string, files: string[]): string[] =>
  files.map((filePath) => path.relative(rootPath, filePath));

test('discovers non-binary files in stable order and skips hard-ignored paths', async () => {
  await withProject(async (rootPath) => {
    writeProjectFile(rootPath, 'b.ts');
    writeProjectFile(rootPath, 'a.js');
    writeProjectFile(rootPath, 'folder with spaces/c.ts');
    writeProjectFile(rootPath, 'unknown.extension');
    writeProjectFile(rootPath, 'image.png');
    writeProjectFile(rootPath, 'node_modules/package/index.js');
    writeProjectFile(rootPath, '.git/internal.js');
    writeProjectFile(rootPath, '.jj/internal.js');

    const files = await discoverFmtPaths({ cwd: rootPath });

    expect(relativePaths(rootPath, files)).toEqual([
      'a.js',
      'b.ts',
      path.join('folder with spaces', 'c.ts'),
      'unknown.extension',
    ]);
    await expect(
      discoverFmtPaths({ cwd: rootPath, patterns: ['node_modules/package/index.js'] }),
    ).resolves.toEqual([]);
  });
});

test('combines files, directories, and globs without duplicates', async () => {
  await withProject(async (rootPath) => {
    const firstFilePath = writeProjectFile(rootPath, 'src/a.ts');
    writeProjectFile(rootPath, 'src/b.js');
    writeProjectFile(rootPath, 'test/c.ts');
    writeProjectFile(rootPath, 'dot/.hidden.ts');

    const files = await discoverFmtPaths({
      cwd: rootPath,
      patterns: ['src', 'src/**/*.ts', firstFilePath, '!**/b.js'],
    });
    const extglobFiles = await discoverFmtPaths({
      cwd: rootPath,
      patterns: ['src/@(a.ts|b.js)'],
    });
    const braceFiles = await discoverFmtPaths({
      cwd: rootPath,
      patterns: ['{src,test}/**/*.ts'],
    });
    const dotFiles = await discoverFmtPaths({
      cwd: rootPath,
      patterns: ['dot/**/*.ts'],
    });

    expect(relativePaths(rootPath, files)).toEqual([path.join('src', 'a.ts')]);
    expect(relativePaths(rootPath, extglobFiles)).toEqual([
      path.join('src', 'a.ts'),
      path.join('src', 'b.js'),
    ]);
    expect(relativePaths(rootPath, braceFiles)).toEqual([
      path.join('src', 'a.ts'),
      path.join('test', 'c.ts'),
    ]);
    expect(relativePaths(rootPath, dotFiles)).toEqual([path.join('dot', '.hidden.ts')]);
    await expect(
      discoverFmtPaths({ cwd: rootPath, patterns: ['missing/**/*.ts'] }),
    ).resolves.toEqual([]);
  });
});

test.runIf(process.platform !== 'win32')('does not follow file or directory symlinks', async () => {
  await withProject(async (rootPath) => {
    const targetPath = writeProjectFile(rootPath, 'target/index.ts');
    symlinkSync(path.join(rootPath, 'target'), path.join(rootPath, 'linked-directory'));
    symlinkSync(targetPath, path.join(rootPath, 'linked-file.ts'));

    const discoveredFiles = await discoverFmtPaths({ cwd: rootPath });
    const explicitFiles = await discoverFmtPaths({
      cwd: rootPath,
      patterns: ['linked-directory', 'linked-file.ts'],
    });

    expect(relativePaths(rootPath, discoveredFiles)).toEqual([path.join('target', 'index.ts')]);
    expect(explicitFiles).toEqual([]);
  });
});
