import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'rstack/test';
import { normalizeFmtConfig } from '../../src/fmt/config.ts';
import { createFmtFileResolver } from '../../src/fmt/fileResolver.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

test('applies matching overrides before resolving plugins', async () => {
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
    const config = normalizeFmtConfig(
      {
        overrides: [
          {
            files: '*.{fixture,ts}',
            options: { plugins: ['prettier-plugin-fixture'] },
          },
          {
            files: '*.md',
            options: { plugins: ['missing-plugin'] },
          },
        ],
      },
      rootPath,
    );
    const resolveFile = createFmtFileResolver(config);

    const files = await Promise.all([
      resolveFile(path.join(rootPath, 'example.fixture')),
      resolveFile(path.join(rootPath, 'example.ts')),
    ]);

    expect(files).toEqual([
      {
        path: path.join(rootPath, 'example.fixture'),
        options: { plugins: [pathToFileURL(pluginEntry).href] },
      },
      {
        path: path.join(rootPath, 'example.ts'),
        options: { plugins: [pathToFileURL(pluginEntry).href] },
      },
    ]);
  });
});
