import { readFileSync } from 'node:fs';
import { expect, rs, test } from 'rstack/test';
import { runFmtFiles } from '../../src/fmt/runner.ts';
import type { FmtFileRequest } from '../../src/fmt/types.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

rs.mock('../../src/fmt/parallel.ts', () => ({
  createFmtWorker: () => Promise.reject(new Error('worker startup failed')),
}));

const createRequest = (
  filePath: string,
  plugins?: FmtFileRequest['options']['plugins'],
): FmtFileRequest => ({
  path: filePath,
  options: {
    filepath: filePath,
    parser: 'typescript',
    plugins,
  },
});

test('does not write files when worker startup fails', async () => {
  await withTempProject(async (rootPath) => {
    const filePaths = ['first.ts', 'second.ts'].map((name) =>
      writeProjectFile(rootPath, name, 'const value=1'),
    );

    await expect(
      runFmtFiles({
        files: filePaths.map((filePath) => createRequest(filePath)),
        mode: 'write',
        cache: false,
        parallel: true,
      }),
    ).rejects.toThrow('worker startup failed');

    for (const filePath of filePaths) {
      expect(readFileSync(filePath, 'utf8')).toBe('const value=1');
    }
  });
});

test('uses serial execution when options cannot be cloned', async () => {
  await withTempProject(async (rootPath) => {
    const pluginWithFunction = {
      languages: [],
      run() {},
    };
    const filePaths = ['first.ts', 'second.ts'].map((name) =>
      writeProjectFile(rootPath, name, 'const value=1'),
    );

    const result = await runFmtFiles({
      files: filePaths.map((filePath) => createRequest(filePath, [pluginWithFunction])),
      mode: 'write',
      cache: false,
      parallel: true,
    });

    expect(result.files.map((file) => file.status)).toEqual(['written', 'written']);
    for (const filePath of filePaths) {
      expect(readFileSync(filePath, 'utf8')).toBe('const value = 1;\n');
    }
  });
});
