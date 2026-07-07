import { rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { execCli, getDistFiles, getFileContent } from '#test-helpers';

const cwd = import.meta.dirname;
const expectedText = 'define.app works';

test('should build app with define.app config', async () => {
  const distPath = path.join(cwd, 'dist');
  await rm(distPath, { recursive: true, force: true });

  try {
    execCli(['build'], { cwd });

    const files = await getDistFiles(distPath);
    const output = getFileContent(files, 'static/js/index.js');

    expect(output).toContain(expectedText);
  } finally {
    await rm(distPath, { recursive: true, force: true });
  }
});
