import { rm } from 'node:fs/promises';
import path from 'node:path';
import { getDistFiles, getFileContent, test } from '#test-helpers';

const expectedText = 'define.lib works';

test('should build lib with define.lib config', async ({ cwd, execCli, expect }) => {
  const distPath = path.join(cwd, 'dist');
  await rm(distPath, { recursive: true, force: true });

  execCli(['lib']);

  const files = await getDistFiles(distPath);
  const output = getFileContent(files, 'index.js');

  expect(output).toContain(expectedText);
});
