import { getDistFiles, getFileContent } from '@rstackjs/test-utils';
import { test } from '#test-helpers';

const expectedText = 'define.lib works';

test('should build lib with define.lib config', async ({ prepareDist, execCli, expect }) => {
  const distPath = await prepareDist();

  execCli('lib');

  const files = await getDistFiles(distPath);
  const output = getFileContent(files, 'index.js');

  expect(output).toContain(expectedText);
});
