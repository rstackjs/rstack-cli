import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from '#test-helpers';
import { expect } from 'rstack/test';

test('should preserve an explicit basePath', async ({
  cwd,
  execCli,
  logHelper,
}) => {
  const filePath = path.join(cwd, 'src/index.js');
  await writeFile(filePath, `alert('hello');\n`);

  try {
    expect(() => execCli('lint src/index.js')).toThrow();
    await logHelper.expectLog('Unexpected alert');
  } finally {
    await writeFile(filePath, `console.log('hello');\n`);
  }
});
