import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from '#test-helpers';
import { expect } from 'rstack/test';

test('should run lint with define.lint config', ({ execCli }) => {
  execCli('lint src/index.js');
});

test('should fail when lint reports errors', async ({ cwd, execCli, logHelper }) => {
  const filePath = path.join(cwd, 'src/test-temp-error.js');
  await writeFile(filePath, 'debugger;');
  expect(() => execCli('lint src/test-temp-error.js')).toThrow();
  await logHelper.expectLog(`Unexpected 'debugger' statement`);
});
