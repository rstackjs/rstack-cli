import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { normalizeFmtConfig } from '../../src/fmt/config.ts';
import { discoverFmtFiles } from '../../src/fmt/discovery.ts';
import type { FmtConfig } from '../../src/fmt/types.ts';

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

const discover = async (cwd: string, patterns?: string[], config?: FmtConfig, configRoot = cwd) =>
  discoverFmtFiles({
    cwd,
    patterns,
    config: normalizeFmtConfig(config, configRoot),
  });

const relativePaths = (rootPath: string, files: Awaited<ReturnType<typeof discover>>): string[] =>
  files.map((file) => path.relative(rootPath, file.path));

test('applies config ignore patterns to discovered and explicit files', async () => {
  await withProject(async (rootPath) => {
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
  await withProject(async (rootPath) => {
    const configRoot = path.join(rootPath, 'project');
    const filePath = writeProjectFile(rootPath, 'shared/index.ts');
    mkdirSync(configRoot);

    await expect(
      discover(configRoot, [filePath], { ignorePatterns: ['../shared/*.ts'] }, configRoot),
    ).resolves.toEqual([]);
  });
});

test('resolves parsers and accepts unknown extensions with an explicit parser', async () => {
  await withProject(async (rootPath) => {
    writeProjectFile(rootPath, 'index.ts');
    writeProjectFile(rootPath, 'source.custom');
    writeProjectFile(rootPath, 'unknown.extension');

    const inferredFiles = await discover(rootPath);
    const configuredFiles = await discover(rootPath, ['source.custom'], { parser: 'babel' });

    expect(relativePaths(rootPath, inferredFiles)).toEqual(['index.ts']);
    expect(inferredFiles[0].options.parser).toBe('typescript');
    expect(configuredFiles[0].options).toMatchObject({
      filepath: path.join(rootPath, 'source.custom'),
      parser: 'babel',
    });
  });
});
