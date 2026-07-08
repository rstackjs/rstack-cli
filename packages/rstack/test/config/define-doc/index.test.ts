import { rm } from 'node:fs/promises';
import path from 'node:path';
import { getDistFiles, getFileContent, test } from '#test-helpers';

const expectedText = 'define.doc works';

test('should build docs with define.doc config', async ({ cwd, execCli, expect }) => {
  const distPath = path.join(cwd, 'doc_build');
  await rm(distPath, { recursive: true, force: true });

  execCli('doc build');

  const files = await getDistFiles(distPath);
  const output = getFileContent(files, 'index.html');

  expect(output).toContain(expectedText);
});
