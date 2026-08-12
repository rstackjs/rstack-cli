import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { normalizeFmtConfig } from '../../src/fmt/config.ts';
import { discoverFmtFiles } from '../../src/fmt/discovery.ts';
import type { FmtConfig } from '../../src/fmt/types.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

const discover = async (cwd: string, patterns?: string[], config?: FmtConfig, configRoot = cwd) =>
  discoverFmtFiles({
    cwd,
    patterns,
    config: normalizeFmtConfig(config, configRoot),
  });

const relativePaths = (rootPath: string, files: Awaited<ReturnType<typeof discover>>): string[] =>
  files.map((file) => path.relative(rootPath, file.path));

test('applies config ignore patterns to discovered and explicit files', async () => {
  await withTempProject(async (rootPath) => {
    const keepPath = writeProjectFile(rootPath, 'generated/keep.ts');
    const blockedPath = writeProjectFile(rootPath, 'generated/blocked.ts');
    writeProjectFile(rootPath, 'src/index.ts');
    const config = { ignorePatterns: ['generated/blocked.ts'] };

    const discoveredFiles = await discover(rootPath, undefined, config);
    const explicitFiles = await discover(rootPath, [keepPath, blockedPath], config);

    expect(relativePaths(rootPath, discoveredFiles)).toEqual([
      path.join('generated', 'keep.ts'),
      path.join('src', 'index.ts'),
    ]);
    expect(relativePaths(rootPath, explicitFiles)).toEqual([path.join('generated', 'keep.ts')]);
  });
});

test('applies config ignore patterns outside the config root', async () => {
  await withTempProject(async (rootPath) => {
    const configRoot = path.join(rootPath, 'project');
    const filePath = writeProjectFile(rootPath, 'shared/index.ts');
    mkdirSync(configRoot);

    await expect(
      discover(configRoot, [filePath], { ignorePatterns: ['../shared/*.ts'] }, configRoot),
    ).resolves.toEqual([]);
  });
});

test('excludes .rstack from discovery', async () => {
  await withTempProject(async (rootPath) => {
    const cacheFile = writeProjectFile(rootPath, '.rstack/cache/fmt-v1.json', '{}');
    writeProjectFile(rootPath, 'index.ts');

    const discoveredFiles = await discover(rootPath);
    const explicitFile = await discover(rootPath, [cacheFile]);

    expect(relativePaths(rootPath, discoveredFiles)).toEqual(['index.ts']);
    expect(explicitFile).toEqual([]);
  });
});

test('excludes a custom cache directory', async () => {
  await withTempProject(async (rootPath) => {
    const cacheDir = path.join(rootPath, 'custom-cache');
    const cacheFile = writeProjectFile(rootPath, 'custom-cache/v1.json', '{}');
    writeProjectFile(rootPath, 'custom-cache/nested/ignored.ts');
    writeProjectFile(rootPath, 'index.ts');

    const discoveredFiles = await discoverFmtFiles({
      cwd: rootPath,
      excludedDirPath: cacheDir,
      config: normalizeFmtConfig(undefined, rootPath),
    });
    const explicitFile = await discoverFmtFiles({
      cwd: rootPath,
      excludedDirPath: cacheDir,
      patterns: [cacheFile],
      config: normalizeFmtConfig(undefined, rootPath),
    });

    expect(relativePaths(rootPath, discoveredFiles)).toEqual(['index.ts']);
    expect(explicitFile).toEqual([]);
  });
});

test('keeps files re-included by a CLI ignore file during directory traversal', async () => {
  await withTempProject(async (rootPath) => {
    writeProjectFile(rootPath, '.prettierignore', 'generated/*\n!generated/keep.ts\n');
    writeProjectFile(rootPath, 'generated/drop.ts');
    writeProjectFile(rootPath, 'generated/keep.ts');
    writeProjectFile(rootPath, 'src/index.ts');

    const files = await discoverFmtFiles({
      cwd: rootPath,
      patterns: ['**/*.ts'],
      ignorePaths: ['.prettierignore'],
      config: normalizeFmtConfig(undefined, rootPath),
    });

    expect(relativePaths(rootPath, files)).toEqual([
      path.join('generated', 'keep.ts'),
      path.join('src', 'index.ts'),
    ]);
  });
});

test('defers parser inference to workers and preserves an explicit parser', async () => {
  await withTempProject(async (rootPath) => {
    writeProjectFile(rootPath, 'index.js');
    writeProjectFile(rootPath, 'index.ts');
    writeProjectFile(rootPath, 'source.custom');
    writeProjectFile(rootPath, 'unknown.extension');

    const inferredFiles = await discover(rootPath);
    const configuredFiles = await discover(rootPath, ['source.custom'], { parser: 'babel' });

    expect(relativePaths(rootPath, inferredFiles)).toEqual([
      'index.js',
      'index.ts',
      'source.custom',
      'unknown.extension',
    ]);
    expect(inferredFiles.every((file) => file.options.parser === undefined)).toBe(true);
    expect(configuredFiles[0]).toEqual({
      path: path.join(rootPath, 'source.custom'),
      options: { parser: 'babel' },
    });
  });
});
