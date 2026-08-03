import { readFileSync } from 'node:fs';
import { expect, test } from 'rstack/test';
import { formatFile } from '../../src/fmt/worker.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

test('writes formatted files', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = writeProjectFile(rootPath, 'example.ts', 'const value=1');

    await expect(
      formatFile(
        {
          path: filePath,
          options: {
            filepath: filePath,
            parser: 'typescript',
          },
        },
        true,
      ),
    ).resolves.toBe(true);

    expect(readFileSync(filePath, 'utf8')).toBe('const value = 1;\n');
  });
});
