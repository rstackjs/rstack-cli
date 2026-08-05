import { symlinkSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { discoverFmtPaths } from '../../src/fmt/discoverPaths.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

const relativePaths = (rootPath: string, files: string[]): string[] =>
  files.map((filePath) => path.relative(rootPath, filePath));

test('discovers non-binary files in stable order and skips hard-ignored paths', async () => {
  await withTempProject(async (rootPath) => {
    writeProjectFile(rootPath, 'b.ts');
    writeProjectFile(rootPath, 'a.js');
    writeProjectFile(rootPath, 'folder with spaces/c.ts');
    writeProjectFile(rootPath, 'unknown.extension');
    writeProjectFile(rootPath, 'image.png');
    writeProjectFile(rootPath, 'node_modules/package/index.js');
    writeProjectFile(rootPath, '.git/internal.js');
    writeProjectFile(rootPath, '.jj/internal.js');

    const files = await discoverFmtPaths({ cwd: rootPath });
    const filesWithNodeModules = await discoverFmtPaths({ cwd: rootPath, withNodeModules: true });

    expect(relativePaths(rootPath, files)).toEqual([
      'a.js',
      'b.ts',
      path.join('folder with spaces', 'c.ts'),
      'unknown.extension',
    ]);
    expect(relativePaths(rootPath, filesWithNodeModules)).toEqual([
      'a.js',
      'b.ts',
      path.join('folder with spaces', 'c.ts'),
      path.join('node_modules', 'package', 'index.js'),
      'unknown.extension',
    ]);
    await expect(
      discoverFmtPaths({ cwd: rootPath, patterns: ['node_modules/package/index.js'] }),
    ).resolves.toEqual([]);
    await expect(
      discoverFmtPaths({
        cwd: rootPath,
        patterns: ['node_modules/package/index.js'],
        withNodeModules: true,
      }),
    ).resolves.toEqual([path.join(rootPath, 'node_modules/package/index.js')]);
  });
});

test('keeps node_modules excluded by gitignore when built-in exclusion is disabled', async () => {
  await withTempProject(async (rootPath) => {
    writeProjectFile(rootPath, '.gitignore', 'node_modules/\n');
    writeProjectFile(rootPath, 'node_modules/package/index.js');
    writeProjectFile(rootPath, 'index.js');

    const files = await discoverFmtPaths({ cwd: rootPath, withNodeModules: true });

    expect(relativePaths(rootPath, files)).toEqual(['.gitignore', 'index.js']);
  });
});

test('combines files, directories, and globs without duplicates', async () => {
  await withTempProject(async (rootPath) => {
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

test('applies nested gitignore rules with child negation', async () => {
  await withTempProject(async (rootPath) => {
    writeProjectFile(rootPath, '.gitignore', '*.js\ndist/\n');
    writeProjectFile(rootPath, 'src/.gitignore', '!keep.js\n');
    writeProjectFile(rootPath, 'dist/.gitignore', '!keep.js\n');
    writeProjectFile(rootPath, 'dist/nested/.gitignore', '!keep.js\n');
    writeProjectFile(rootPath, 'src/keep.js');
    writeProjectFile(rootPath, 'src/drop.js');
    writeProjectFile(rootPath, 'dist/keep.js');
    writeProjectFile(rootPath, 'dist/nested/keep.js');
    writeProjectFile(rootPath, 'visible.ts');

    const files = await discoverFmtPaths({ cwd: rootPath, patterns: ['**/*.{js,ts}'] });
    const ignoredNestedDirectory = await discoverFmtPaths({
      cwd: rootPath,
      patterns: ['dist/nested'],
    });

    expect(relativePaths(rootPath, files)).toEqual([path.join('src', 'keep.js'), 'visible.ts']);
    expect(ignoredNestedDirectory).toEqual([]);
  });
});

test('lets explicit files bypass gitignore', async () => {
  await withTempProject(async (rootPath) => {
    writeProjectFile(rootPath, '.gitignore', '/generated/\n');
    const keepPath = writeProjectFile(rootPath, 'generated/keep.ts');
    writeProjectFile(rootPath, 'src/index.ts');

    const discoveredFiles = await discoverFmtPaths({
      cwd: rootPath,
      patterns: ['**/*.ts'],
    });
    const explicitFiles = await discoverFmtPaths({ cwd: rootPath, patterns: [keepPath] });

    expect(relativePaths(rootPath, discoveredFiles)).toEqual([path.join('src', 'index.ts')]);
    expect(relativePaths(rootPath, explicitFiles)).toEqual([path.join('generated', 'keep.ts')]);
  });
});

test('prunes directories with an external ignore matcher', async () => {
  await withTempProject(async (rootPath) => {
    writeProjectFile(rootPath, 'generated/nested/output.ts');
    writeProjectFile(rootPath, 'src/index.ts');
    const checkedDirectories: string[] = [];
    const generatedPath = path.join(rootPath, 'generated');
    const isDirectoryIgnored = (directoryPath: string): boolean => {
      checkedDirectories.push(path.relative(rootPath, directoryPath));
      return directoryPath === generatedPath;
    };

    const files = await discoverFmtPaths({ cwd: rootPath, isDirectoryIgnored });
    const ignoredRoot = await discoverFmtPaths({
      cwd: rootPath,
      patterns: ['generated'],
      isDirectoryIgnored,
    });

    expect(relativePaths(rootPath, files)).toEqual([path.join('src', 'index.ts')]);
    expect(ignoredRoot).toEqual([]);
    expect(checkedDirectories).toContain('generated');
    expect(checkedDirectories).not.toContain(path.join('generated', 'nested'));
  });
});

test.runIf(process.platform !== 'win32')('does not follow file or directory symlinks', async () => {
  await withTempProject(async (rootPath) => {
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
