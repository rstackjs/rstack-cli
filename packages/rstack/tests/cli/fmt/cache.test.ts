import { expect, test } from 'rstack/test';
import { expectWriteSummary, normalizeDuration, setupFmtTest } from './helpers.ts';

const { projectFileExists, readProjectFile, resolveProjectPath, runFmt, writeProjectFile } =
  setupFmtTest();

test.each([
  ['write', []],
  ['check', ['--check']],
  ['list-different', ['--list-different']],
] as const)('uses the default cache in %s mode', (_, args) => {
  writeProjectFile('index.ts', 'const value = 1;\n');
  writeProjectFile('.rstack/cache/fmt-v1.json', 'legacy');

  const result = runFmt([...args, 'index.ts']);

  expect(result.status).toBe(0);
  expect(readProjectFile('.rstack/cache/.gitignore')).toBe('*\n');
  expect(JSON.parse(readProjectFile('.rstack/cache/fmt/v1.json'))).toMatchObject({
    version: 1,
    files: {
      'index.ts': [expect.any(String), expect.any(String), 'clean'],
    },
  });
  expect(readProjectFile('.rstack/cache/fmt-v1.json')).toBe('legacy');
});

test('--no-cache bypasses cache reads and writes', () => {
  writeProjectFile('index.ts', 'const value=1');
  writeProjectFile('custom-cache/v1.json', '{"value":true}');

  const first = runFmt([
    '--no-cache',
    '--cache-location',
    'custom-cache',
    'index.ts',
    'custom-cache/v1.json',
  ]);

  expect(first.status).toBe(0);
  expect(readProjectFile('custom-cache/v1.json')).toBe('{ "value": true }\n');
  expect(projectFileExists('.rstack')).toBe(false);

  writeProjectFile('.rstack/cache/fmt-v1.json', 'stale');
  writeProjectFile('index.ts', 'const value=2');
  const second = runFmt(['--no-cache', 'index.ts']);

  expect(second.status).toBe(0);
  expect(readProjectFile('index.ts')).toBe('const value = 2;\n');
  expect(readProjectFile('.rstack/cache/fmt-v1.json')).toBe('stale');
  expect(projectFileExists('.rstack/cache/.gitignore')).toBe(false);
});

test.each(['relative', 'absolute'] as const)('uses a %s custom cache location', (kind) => {
  const cacheLocation = kind === 'relative' ? 'custom-cache' : resolveProjectPath('custom-cache');
  writeProjectFile('index.ts', 'const value = 1;\n');

  const result = runFmt(['--cache-location', cacheLocation, 'index.ts']);

  expect(result.status).toBe(0);
  expect(JSON.parse(readProjectFile('custom-cache/v1.json'))).toMatchObject({
    version: 1,
    files: {
      'index.ts': [expect.any(String), expect.any(String), 'clean'],
    },
  });
  expect(projectFileExists('custom-cache/.gitignore')).toBe(false);
  expect(projectFileExists('.rstack')).toBe(false);
});

test.each(['.', '..'])('rejects a custom cache location at %s', (cacheLocation) => {
  const result = runFmt(['--cache-location', cacheLocation, '.']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(
    'The --cache-location directory cannot be the current working directory or an ancestor.',
  );
});

test('excludes the custom cache directory from formatting', () => {
  const cacheLocation = 'custom-cache';
  writeProjectFile('index.ts', 'const value = 1;\n');
  writeProjectFile('custom-cache/nested/ignored.ts', 'const value=2');
  expect(runFmt(['--cache-location', cacheLocation, 'index.ts']).status).toBe(0);

  const result = runFmt(['--cache-location', cacheLocation, '.']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 2, 0);
  expect(readProjectFile('custom-cache/nested/ignored.ts')).toBe('const value=2');
});

test('uses an explicit config root cache from a subdirectory', () => {
  const appPath = resolveProjectPath('packages/app');
  writeProjectFile('packages/app/index.ts', 'const value=1');

  const result = runFmt(['index.ts', '--config', '../../rstack.config.ts'], appPath);

  expect(result.status).toBe(0);
  expect(readProjectFile('packages/app/index.ts')).toBe('const value = 1;\n');
  expect(projectFileExists('.rstack/cache/fmt/v1.json')).toBe(true);
  expect(projectFileExists('packages/app/.rstack')).toBe(false);
  expect(JSON.parse(readProjectFile('.rstack/cache/fmt/v1.json'))).toMatchObject({
    files: {
      'packages/app/index.ts': [expect.any(String), expect.any(String), 'clean'],
    },
  });
});

test('recovers from a corrupted cache', () => {
  writeProjectFile('index.ts', 'const value = 1;\n');
  const first = runFmt(['--check', 'index.ts']);
  writeProjectFile('.rstack/cache/fmt/v1.json', '{');

  const second = runFmt(['--check', 'index.ts']);

  expect(second.status).toBe(0);
  expect(normalizeDuration(second.stdout)).toBe(normalizeDuration(first.stdout));
  expect(second.stderr).toBe(first.stderr);
  expect(JSON.parse(readProjectFile('.rstack/cache/fmt/v1.json'))).toMatchObject({ version: 1 });
});

test('formats without a writable cache directory', () => {
  writeProjectFile('.rstack', 'not a directory');
  writeProjectFile('index.ts', 'const value=1');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(0);
  expect(readProjectFile('index.ts')).toBe('const value = 1;\n');
});
