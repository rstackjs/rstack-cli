import { rm } from 'node:fs/promises';
import { getDistFiles, getFileContent } from '@rstackjs/test-utils';
import { test } from '#test-helpers';

const expectedText = 'define.app works';

test('should build app with define.app config', async ({ prepareDist, execCli, expect }) => {
  const distPath = await prepareDist();

  try {
    execCli('build');

    const files = await getDistFiles(distPath);
    const output = getFileContent(files, 'static/js/index.js');

    expect(output).toContain(expectedText);
  } finally {
    await rm(distPath, { recursive: true, force: true });
  }
});
