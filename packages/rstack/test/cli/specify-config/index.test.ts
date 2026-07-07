import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { execCli } from '../../helpers/cli.ts';

const cwd = import.meta.dirname;

test('should build with rstack --config', async () => {
  await rm(path.join(cwd, 'dist'), { recursive: true, force: true });

  execCli(['--config', './custom.config.ts', 'build'], {
    cwd,
  });

  const output = await readFile(path.join(cwd, 'dist/static/js/index.js'), 'utf-8');
  expect(output).toContain('rstack config works');
});
