import { getDistFiles, getFileContent } from '@rstackjs/test-utils';
import { test } from '#test-helpers';

const expectedText = 'define.doc works';

test('should build docs with define.doc config', async ({ prepareDist, execCli, expect }) => {
  const distPath = await prepareDist('doc_build');

  execCli('doc build');

  const files = await getDistFiles(distPath);
  const output = getFileContent(files, 'index.html');

  expect(output).toContain(expectedText);
});
