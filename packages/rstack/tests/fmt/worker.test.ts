import { readFileSync } from 'node:fs';
import path from 'node:path';
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
    ).resolves.toBe('changed');

    expect(readFileSync(filePath, 'utf8')).toBe('const value = 1;\n');
  });
});

test('infers the parser for an explicitly provided node_modules file', async () => {
  await withTempProject(async (rootPath) => {
    const source = 'const value=1';
    const filePath = writeProjectFile(rootPath, 'node_modules/example/index.ts', source);

    await expect(
      formatFile(
        {
          path: filePath,
          options: { filepath: filePath },
        },
        false,
      ),
    ).resolves.toBe('changed');

    expect(readFileSync(filePath, 'utf8')).toBe(source);
  });
});

test('skips unsupported files before reading them', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = path.join(rootPath, 'missing.unknown');

    await expect(
      formatFile(
        {
          path: filePath,
          options: { filepath: filePath },
        },
        true,
      ),
    ).resolves.toBe('unsupported');
  });
});
