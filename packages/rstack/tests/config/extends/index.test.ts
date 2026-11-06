import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { loadRstackConfig } from '../../../src/config.ts';
import { resolveConfigLayers } from '../../../src/configLayers.ts';

const cwd = import.meta.dirname;

test('loads all seven tools from shared configs and tracks their dependencies', () => {
  // Dependency tracking uses Node loader hooks, outside the test VM.
  const output = execFileSync(
    process.execPath,
    [path.join(cwd, 'load-shared.ts')],
    { encoding: 'utf8', timeout: 10_000 },
  );
  const result: unknown = JSON.parse(output);
  const dependencies: unknown = expect.arrayContaining([
    path.join(cwd, 'shared.ts'),
  ]);

  expect(result).toEqual({
    configs: {
      app: [
        {
          source: {
            define: { ENV: 'production' },
          },
        },
      ],
      lib: [
        {
          lib: [{ format: 'esm' }],
        },
      ],
      doc: [{ root: 'docs' }],
      test: [{ setupFiles: [path.join(cwd, 'setup.ts')] }],
      lint: [
        [
          {
            rules: { 'no-debugger': 'error' },
          },
        ],
      ],
      fmt: [{ semi: false, singleQuote: false, printWidth: 80 }],
      staged: [{ '*.ts': 'rs lint' }],
    },
    filePath: path.join(cwd, 'rstack.config.ts'),
    dependencies,
  });
});

test('preserves project priority regardless of call order and across reloads', async () => {
  for (const configFilePath of [
    'rstack.config.ts',
    'after.config.ts',
    'rstack.config.ts',
  ]) {
    const { configs } = await loadRstackConfig({ cwd, configFilePath });
    expect(await resolveConfigLayers([configs], 'fmt')).toEqual([
      { semi: false, singleQuote: false, printWidth: 80 },
    ]);
  }
});
