import { rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { execCli, getDistFiles, getFileContent } from '#test-helpers';

const cwd = import.meta.dirname;

test('should build with rstack --config', async () => {
  await rm(path.join(cwd, 'dist'), { recursive: true, force: true });

  execCli(['--config', './custom.config.ts', 'build'], { cwd });

  const files = await getDistFiles(path.join(cwd, 'dist'));
  const output = getFileContent(files, 'static/js/index.js');

  expect(output).toContain('specify config works');
});
