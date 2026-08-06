import path from 'node:path';
import { expect, test } from 'rstack/test';
import { createRelativePathResolver } from '../../src/fmt/relativePath.ts';

const rootPath = path.join(import.meta.dirname, 'project');

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
