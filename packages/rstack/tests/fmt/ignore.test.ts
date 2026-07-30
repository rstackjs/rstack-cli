import path from 'node:path';
import { expect, test } from 'rstack/test';
import { normalizeFmtConfig } from '../../src/fmt/config.ts';
import { createFmtIgnoreMatcher } from '../../src/fmt/ignore.ts';

const rootPath = path.join(import.meta.dirname, 'project');

const createMatcher = (ignorePatterns: string[]) =>
  createFmtIgnoreMatcher(normalizeFmtConfig({ ignorePatterns }, rootPath));

test('matches gitignore patterns relative to the config root', () => {
  const isIgnored = createMatcher(['dist/', '*.snap', '/root.js', '# comment', '\\#generated.js']);

  expect(isIgnored(path.join(rootPath, 'dist/index.js'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'src/data.snap'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'root.js'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'nested/root.js'))).toBe(false);
  expect(isIgnored(path.join(rootPath, '#generated.js'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'src/index.js'))).toBe(false);
});

test('applies negated patterns in declaration order', () => {
  const isIgnored = createMatcher(['*.js', '!src/keep.js']);
  const isIgnoredAgain = createMatcher(['*.js', '!src/keep.js', 'src/keep.js']);
  const isReincluded = createMatcher(['dist', '!dist']);
  const filePath = path.join(rootPath, 'src/keep.js');

  expect(isIgnored(filePath)).toBe(false);
  expect(isIgnored(path.join(rootPath, 'src/drop.js'))).toBe(true);
  expect(isIgnoredAgain(filePath)).toBe(true);
  expect(isReincluded(path.join(rootPath, 'dist'))).toBe(false);
});

test('does not let explicit files bypass ignore patterns', () => {
  const isIgnored = createMatcher(['generated/']);
  const explicitFilePath = path.join(rootPath, 'generated/output.js');

  expect(isIgnored(explicitFilePath)).toBe(true);
});

test('matches parent directory patterns without validation', () => {
  const isIgnored = createMatcher(['../shared/*.js']);

  expect(isIgnored(path.join(rootPath, '../shared/index.js'))).toBe(true);
  expect(isIgnored(path.join(rootPath, 'shared/index.js'))).toBe(false);
});

test('does not ignore files when no patterns are configured', () => {
  const isIgnored = createMatcher([]);

  expect(isIgnored(path.join(rootPath, 'src/index.js'))).toBe(false);
});
