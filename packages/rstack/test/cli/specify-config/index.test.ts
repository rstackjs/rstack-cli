import { rm } from 'node:fs/promises';
import path from 'node:path';
import { getDistFiles, getFileContent, test } from '#test-helpers';

test('should build with rstack --config', async ({ cwd, execCli, expect }) => {
  await rm(path.join(cwd, 'dist'), { recursive: true, force: true });

  execCli(['--config', './custom.config.ts', 'build']);

  const files = await getDistFiles(path.join(cwd, 'dist'));
  const output = getFileContent(files, 'static/js/index.js');

  expect(output).toContain('specify config works');
});
