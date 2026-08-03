import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

test('resolves plugins after applying matching overrides', async () => {
  await withTempProject(async (rootPath) => {
    const pluginEntry = writeProjectFile(
      rootPath,
      'node_modules/prettier-plugin-fixture/index.mjs',
      `export default {
  languages: [
    { name: 'Fixture JSON', parsers: ['json'], extensions: ['.fixture'] },
    { name: 'Fixture TypeScript', parsers: ['babel'], extensions: ['.ts'] },
  ],
};
`,
    );
    writeProjectFile(
      rootPath,
      'node_modules/prettier-plugin-fixture/package.json',
      JSON.stringify({ name: 'prettier-plugin-fixture', exports: './index.mjs' }),
    );
    writeProjectFile(rootPath, 'example.fixture');
    writeProjectFile(rootPath, 'example.ts');
    const config = {
      overrides: [
        {
          files: '*.fixture',
          options: { plugins: ['prettier-plugin-fixture'] },
        },
        {
          files: '*.ts',
          options: { plugins: ['prettier-plugin-fixture'] },
        },
        {
          files: '*.md',
          options: { plugins: ['missing-plugin'] },
        },
      ],
    };

    const files = await discover(rootPath, ['example.fixture', 'example.ts'], config);

    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      options: {
        plugins: [pathToFileURL(pluginEntry).href],
      },
    });
    expect(files[1]).toMatchObject({
      options: {
        plugins: [pathToFileURL(pluginEntry).href],
      },
    });
  });
});
