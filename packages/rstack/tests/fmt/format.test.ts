import path from 'node:path';
import { expect, test } from 'rstack/test';
import { formatFmtSource } from '../../src/fmt/format.ts';

const rootPath = path.join(import.meta.dirname, 'fixture');

test('formats sources without touching the file system', async () => {
  await expect(
    formatFmtSource(
      { path: path.join(rootPath, 'missing.ts'), options: {} },
      () => 'const value=1',
    ),
  ).resolves.toEqual({
    status: 'formatted',
    source: 'const value=1',
    formatted: 'const value = 1;\n',
  });
});

test('applies resolved options to the source', async () => {
  const result = await formatFmtSource(
    { path: path.join(rootPath, 'missing.ts'), options: { singleQuote: true, semi: false } },
    () => 'const message="hello"',
  );

  expect(result).toEqual({
    status: 'formatted',
    source: 'const message="hello"',
    formatted: "const message = 'hello'\n",
  });
});

test('sorts package.json when the option is enabled', async () => {
  const result = await formatFmtSource(
    { path: path.join(rootPath, 'package.json'), options: { sortPackageJson: true } },
    () => '{"version":"1.0.0","name":"fixture"}',
  );

  expect(result).toEqual({
    status: 'formatted',
    source: '{"version":"1.0.0","name":"fixture"}',
    formatted: '{\n  "name": "fixture",\n  "version": "1.0.0"\n}\n',
  });
});

test('reports unsupported files before reading the source', async () => {
  let read = false;

  await expect(
    formatFmtSource({ path: path.join(rootPath, 'missing.unknown'), options: {} }, () => {
      read = true;
      return '';
    }),
  ).resolves.toEqual({ status: 'unsupported' });
  expect(read).toBe(false);
});

test('rejects sources that cannot be parsed', async () => {
  await expect(
    formatFmtSource({ path: path.join(rootPath, 'invalid.ts'), options: {} }, () => 'const x = ;'),
  ).rejects.toThrow("Unexpected token ';'");
});
