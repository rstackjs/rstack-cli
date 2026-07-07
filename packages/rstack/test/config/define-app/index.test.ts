import { rm } from 'node:fs/promises';
import path from 'node:path';
import { getDistFiles, getFileContent, test } from '#test-helpers';

const expectedText = 'define.app works';

test('should build app with define.app config', async ({ cwd, execCli, expect }) => {
  const distPath = path.join(cwd, 'dist');
  await rm(distPath, { recursive: true, force: true });

  try {
    execCli('build');

    const files = await getDistFiles(distPath);
    const output = getFileContent(files, 'static/js/index.js');

    expect(output).toContain(expectedText);
  } finally {
    await rm(distPath, { recursive: true, force: true });
  }
});
