import { getDistFiles, getFileContent } from '@rstackjs/test-utils';
import { test } from '#test-helpers';

test('should build with rstack --config', async ({ prepareDist, execCli, expect }) => {
  const distPath = await prepareDist();

  execCli('build --config ./custom.config.ts');

  const files = await getDistFiles(distPath);
  const output = getFileContent(files, 'static/js/index.js');

  expect(output).toContain('specify config works');
});
