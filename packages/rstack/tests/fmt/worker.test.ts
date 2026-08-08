import path from 'node:path';
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
    const extensionlessPath = writeProjectFile(rootPath, 'script', source);
    const missingPath = path.join(rootPath, 'missing.unknown');
    const contentHash = sha256(source);
    const optionsHash = 'options';

    for (const [entry, targetPath, shouldWrite, status] of [
      [[contentHash, optionsHash, 'clean'], filePath, false, 'unchanged'],
      [[contentHash, optionsHash, 'dirty'], filePath, false, 'changed'],
      [[contentHash, optionsHash, 'clean'], filePath, true, 'unchanged'],
      [[contentHash, optionsHash, 'unsupported'], extensionlessPath, false, 'unsupported'],
      [[contentHash, optionsHash, 'unsupported'], extensionlessPath, true, 'unsupported'],
      [[null, optionsHash, 'unsupported'], missingPath, false, 'unsupported'],
      [[null, optionsHash, 'unsupported'], missingPath, true, 'unsupported'],
    ] as const) {
      await expect(
        formatFile({
          file: {
            path: targetPath,
            options: {
              parser: 'unknown-parser',
            },
          },
          shouldWrite,
          cache: {
            entry,
            optionsHash,
          },
        }),
      ).resolves.toEqual({ status });
    }
  });
});

test('does not trust path-only unsupported entries for extensionless files', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = writeProjectFile(rootPath, 'script', '#!/usr/bin/env node\nconst value=1');

    await expect(
      formatFile({
        file: {
          path: filePath,
          options: {},
        },
        shouldWrite: false,
        cache: {
          entry: [null, 'options', 'unsupported'],
          optionsHash: 'options',
        },
      }),
    ).resolves.toEqual({
      status: 'changed',
      cacheEntry: [sha256(readFileSync(filePath)), 'options', 'dirty'],
    });
  });
});

test('resolves parser support before reading on a cache miss', async () => {
  await withTempProject(async (rootPath) => {
    await expect(
      formatFile({
        file: {
          path: path.join(rootPath, 'missing.unknown'),
          options: {},
        },
        shouldWrite: false,
        cache: {
          entry: undefined,
          optionsHash: 'options',
        },
      }),
    ).resolves.toEqual({
      status: 'unsupported',
      cacheEntry: [null, 'options', 'unsupported'],
    });
  });
});
