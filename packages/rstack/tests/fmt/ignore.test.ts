import path from 'node:path';
import { expect, test } from 'rstack/test';
import { normalizeFmtConfig } from '../../src/fmt/config.ts';
import { createIgnoreMatcher } from '../../src/fmt/ignore.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

const rootPath = path.join(import.meta.dirname, 'project');

const createMatcher = (ignorePatterns: string[]) =>
  createIgnoreMatcher({
    config: normalizeFmtConfig({ ignorePatterns }, rootPath),
    cwd: rootPath,
  });

test('matches gitignore patterns relative to the config root', async () => {
  const isIgnored = await createMatcher([
    'dist/',
    '*.snap',
    '/root.js',
    '# comment',
    '\\#generated.js',
  ]);

  expect(isIgnored(path.join(rootPath, 'dist/index.js'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'src/data.snap'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'root.js'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'nested/root.js'))).toBe(false);
  expect(isIgnored(path.join(rootPath, '#generated.js'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'src/index.js'))).toBe(false);
});

test('distinguishes directory-only patterns from files', async () => {
  const isIgnored = await createMatcher(['dist/']);
  const directoryPath = path.join(rootPath, 'dist');

  expect(isIgnored(directoryPath)).toBe(false);
  expect(isIgnored(directoryPath, true)).toBe(true);
  expect(isIgnored(path.join(directoryPath, 'index.js'))).toBe(true);
});

test('does not apply negated directory patterns to files', async () => {
  const isIgnored = await createMatcher(['fixtures/**/*', '!fixtures/**/']);
  const directoryPath = path.join(rootPath, 'fixtures/case');

  expect(isIgnored(directoryPath, true)).toBe(false);
  expect(isIgnored(path.join(directoryPath, 'index.js'))).toBe(true);
});

test('applies negated patterns in declaration order', async () => {
  const isIgnored = await createMatcher(['*.js', '!src/keep.js']);
  const isIgnoredAgain = await createMatcher(['*.js', '!src/keep.js', 'src/keep.js']);
  const isIgnoredAfterReinclude = await createMatcher(['dist', '!dist']);
  const filePath = path.join(rootPath, 'src/keep.js');

  expect(isIgnored(filePath)).toBe(false);
  expect(isIgnored(path.join(rootPath, 'src/drop.js'))).toBe(true);
  expect(isIgnoredAgain(filePath)).toBe(true);
  expect(isIgnoredAfterReinclude(path.join(rootPath, 'dist'))).toBe(false);
});

test('ignores common lock files by default and allows explicit negation', async () => {
  const isIgnored = await createMatcher([]);
  const isIgnoredAfterReinclude = await createMatcher(['!pnpm-lock.yaml']);

  expect(isIgnored(path.join(rootPath, 'package-lock.json'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'packages/app/pnpm-lock.yaml'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'packages/app/PNPM-LOCK.YAML'))).toBe(false);
  expect(isIgnored(path.join(rootPath, '../shared/pnpm-lock.yaml'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'pnpm-lock.yaml.backup'))).toBe(false);
  expect(isIgnoredAfterReinclude(path.join(rootPath, 'pnpm-lock.yaml'))).toBe(false);
});

test('does not let explicit files bypass ignore patterns', async () => {
  const isIgnored = await createMatcher(['generated/']);
  const explicitFilePath = path.join(rootPath, 'generated/output.js');

  expect(isIgnored(explicitFilePath)).toBe(true);
});

test('matches parent directory patterns without validation', async () => {
  const isIgnored = await createMatcher(['../shared/*.js']);

  expect(isIgnored(path.join(rootPath, '../shared/index.js'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'shared/index.js'))).toBe(false);
});

test('does not ignore other files when no patterns are configured', async () => {
  const isIgnored = await createMatcher([]);

  expect(isIgnored(path.join(rootPath, 'src/index.js'))).toBe(false);
});

test('loads repeated ignore paths relative to cwd and each ignore file', async () => {
  await withTempProject(async (projectPath) => {
    writeProjectFile(projectPath, '.prettierignore', 'src/*.js\n!src/keep.js\n');
    writeProjectFile(projectPath, 'config/extra.ignore', '../generated/*.js\n');

    const isIgnored = await createIgnoreMatcher({
      config: normalizeFmtConfig({ ignorePatterns: ['configured.js'] }, projectPath),
      cwd: projectPath,
      ignorePaths: ['.prettierignore', 'config/extra.ignore'],
    });

    expect(isIgnored(path.join(projectPath, 'configured.js'))).toBe(true);
    expect(isIgnored(path.join(projectPath, 'src/drop.js'))).toBe(true);
    expect(isIgnored(path.join(projectPath, 'src/keep.js'))).toBe(false);
    expect(isIgnored(path.join(projectPath, 'generated/output.js'))).toBe(true);
    expect(isIgnored(path.join(projectPath, 'other.js'))).toBe(false);
  });
});

test('reports unreadable ignore paths', async () => {
  await expect(
    createIgnoreMatcher({
      config: normalizeFmtConfig(undefined, rootPath),
      cwd: rootPath,
      ignorePaths: ['missing.ignore'],
    }),
  ).rejects.toThrow('Failed to read ignore file "missing.ignore".');
});
