import path from 'node:path';
import { expect, test } from 'rstack/test';
import { createRelativePathResolver, toPosixPath } from '../../src/fmt/pathHelpers.ts';

const rootPath = path.join(import.meta.dirname, 'project');

test('converts platform paths to POSIX paths', () => {
  expect(toPosixPath(path.join('src', 'index.ts'))).toBe('src/index.ts');
});

test('resolves paths relative to a fixed root', () => {
  const resolveRelativePath = createRelativePathResolver(rootPath);

  expect(resolveRelativePath(rootPath)).toBe('');
  expect(resolveRelativePath(path.join(rootPath, 'src/index.ts'))).toBe(
    path.join('src', 'index.ts'),
  );
});

test('falls back for paths outside the fixed root', () => {
  const resolveRelativePath = createRelativePathResolver(rootPath);
  const siblingPath = path.join(`${rootPath}-other`, 'index.ts');

  expect(resolveRelativePath(siblingPath)).toBe(path.relative(rootPath, siblingPath));
});
