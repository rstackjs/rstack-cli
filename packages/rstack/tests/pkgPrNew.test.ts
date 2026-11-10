import { readFile } from 'node:fs/promises';
import { expect, test } from 'rstack/test';

test('publishes pull request previews for public packages', async () => {
  const [workflow, packageJson, workspace] = await Promise.all([
    readFile(
      new URL('../../../.github/workflows/pkg-pr-new.yml', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../../../pnpm-workspace.yaml', import.meta.url), 'utf8'),
  ]);

  expect(workflow).toContain('pkg-pr-new publish --pnpm --previewVersion');
  expect(workflow).toContain("'./packages/rstack'");
  expect(workflow).toContain("'./packages/create-rstack'");
  expect(workflow).not.toContain('head.repo.full_name == github.repository');
  expect(packageJson).toContain('"pkg-pr-new": "catalog:"');
  expect(workspace).toContain('pkg-pr-new: 0.0.87');
});
