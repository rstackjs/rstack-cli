import { rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { execCli, getDistFiles, getFileContent } from '#test-helpers';

const cwd = import.meta.dirname;
const expectedText = 'define.lib works';

test('should build lib with define.lib config', async () => {
  const distPath = path.join(cwd, 'dist');
  await rm(distPath, { recursive: true, force: true });

  execCli(['lib'], { cwd });

  const files = await getDistFiles(distPath);
  const output = getFileContent(files, 'index.js');

  expect(output).toContain(expectedText);
});
