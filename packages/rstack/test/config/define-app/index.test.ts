import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { execCli } from '#test-helpers';

const cwd = import.meta.dirname;
const expectedText = 'define.app works';

test('should build app with define.app config', async () => {
  const distPath = path.join(cwd, 'dist');

  await rm(distPath, { recursive: true, force: true });

  try {
    execCli(['build'], {
      cwd,
    });

    const output = await readFile(path.join(distPath, 'static/js/index.js'), 'utf-8');
    expect(output).toContain(expectedText);
  } finally {
    await rm(distPath, { recursive: true, force: true });
  }
});
