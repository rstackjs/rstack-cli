import { readFileSync } from 'node:fs';
import { expect, test } from 'rstack/test';
import { sha256 } from '../../src/fmt/cacheIdentity.ts';
import { formatFile } from '../../src/fmt/worker.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

test('writes formatted files', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = writeProjectFile(rootPath, 'example.ts', 'const value=1');

    await expect(
      formatFile({
        file: {
          path: filePath,
          options: {
            parser: 'typescript',
          },
        },
        shouldWrite: true,
      }),
    ).resolves.toEqual({ status: 'changed' });

    expect(readFileSync(filePath, 'utf8')).toBe('const value = 1;\n');
  });
});

test('infers the parser for an explicitly provided node_modules file', async () => {
  await withTempProject(async (rootPath) => {
    const source = 'const value=1';
    const filePath = writeProjectFile(rootPath, 'node_modules/example/index.ts', source);

    await expect(
      formatFile({
        file: {
          path: filePath,
          options: {},
        },
        shouldWrite: false,
      }),
    ).resolves.toEqual({ status: 'changed' });

    expect(readFileSync(filePath, 'utf8')).toBe(source);
  });
});

test('returns cached states before resolving the parser', async () => {
  await withTempProject(async (rootPath) => {
    const source = 'const value=1';
    const filePath = writeProjectFile(rootPath, 'example.ts', source);
    const contentHash = sha256(source);
    const optionsHash = 'options';

    for (const [state, status] of [
      ['clean', 'unchanged'],
      ['dirty', 'changed'],
    ] as const) {
      await expect(
        formatFile({
          file: {
            path: filePath,
            options: {
              parser: 'unknown-parser',
            },
          },
          shouldWrite: false,
          cache: {
            entry: [contentHash, optionsHash, state],
            optionsHash,
          },
        }),
      ).resolves.toEqual({ status });
    }
  });
});
