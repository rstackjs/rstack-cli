import path from 'node:path';
import { expect, test } from '@rstest/core';
import { resolveRelatedTests } from '../../src/relatedTests.ts';

test('lists related tests through the current Rstack CLI and normalizes its JSON result', async () => {
  const calls: unknown[] = [];
  const packageRoot = path.resolve('/workspace/packages/app');
  const configPath = path.join(packageRoot, 'custom.config.ts');

  const files = await resolveRelatedTests(
    {
      packageRoot,
      configPath,
      sources: [path.join(packageRoot, 'src/index.ts')],
    },
    {
      runCli: (request) => {
        calls.push(request);
        return Promise.resolve({
          stdout: JSON.stringify([
            { file: 'tests/index.test.ts', type: 'file' },
            { file: path.join(packageRoot, 'tests/index.test.ts'), type: 'file' },
          ]),
          stderr: '',
        });
      },
    },
  );

  expect(calls).toEqual([
    {
      cwd: packageRoot,
      args: [
        expect.stringMatching(/bin[\\/]rs\.js$/u),
        'test',
        'list',
        '--related',
        path.join(packageRoot, 'src/index.ts'),
        '--filesOnly',
        '--json',
        '--config',
        configPath,
      ],
    },
  ]);
  expect(files).toEqual([path.join(packageRoot, 'tests/index.test.ts')]);
});

test('reports invalid related-test JSON as an Rstest list failure', async () => {
  await expect(
    resolveRelatedTests(
      { packageRoot: '/workspace', sources: ['/workspace/src/index.ts'] },
      { runCli: () => Promise.resolve({ stdout: 'not json', stderr: 'list failed' }) },
    ),
  ).rejects.toThrow('Rstest related-test listing returned invalid JSON');
});

test('uses the built Rstack and Rstest graph to find tests related to this package config', async () => {
  const packageRoot = path.resolve(import.meta.dirname, '../..');
  const files = await resolveRelatedTests({
    packageRoot,
    configPath: path.join(packageRoot, 'rstack.config.ts'),
    sources: [path.join(packageRoot, 'src/config.ts')],
  });

  expect(files).toContain(path.join(packageRoot, 'tests/context/config.test.ts'));
  expect(files.every((file) => path.isAbsolute(file))).toBe(true);
});
