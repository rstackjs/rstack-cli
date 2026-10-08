import path from 'node:path';
import { expect, test } from 'rstack/test';
import { loadRstackConfig } from '../../../src/config.ts';
import { resolveConfigLayers } from '../../../src/configLayers.ts';

const cwd = import.meta.dirname;
const params = { command: 'build', env: 'production' } as const;

test('loads all seven tools from shared configs and tracks their dependencies', async () => {
  const { configs, filePath, dependencies } = await loadRstackConfig({ cwd });
  const layers = [configs];

  expect({
    app: await resolveConfigLayers(layers, 'app', params),
    lib: await resolveConfigLayers(layers, 'lib', params),
    doc: await resolveConfigLayers(layers, 'doc'),
    test: await resolveConfigLayers(layers, 'test'),
    lint: await resolveConfigLayers(layers, 'lint'),
    fmt: await resolveConfigLayers(layers, 'fmt'),
    staged: await resolveConfigLayers(layers, 'staged'),
  }).toEqual({
    app: [{ source: { define: { ENV: 'production' } } }],
    lib: [{ lib: [{ format: 'esm' }] }],
    doc: [{ root: 'docs' }],
    test: [{ setupFiles: [path.join(cwd, 'setup.ts')] }],
    lint: [[{ rules: { 'no-debugger': 'error' } }]],
    fmt: [{ semi: false, singleQuote: false, printWidth: 80 }],
    staged: [{ '*.ts': 'rs lint' }],
  });
  expect(filePath).toBe(path.join(cwd, 'rstack.config.ts'));
  expect(dependencies).toContain(path.join(cwd, 'shared.ts'));
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
