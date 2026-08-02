import { readFileSync } from 'node:fs';
import { beforeEach, expect, rs, test } from 'rstack/test';
import { runFmtFiles } from '../../src/fmt/runner.ts';
import type { FmtFileRequest } from '../../src/fmt/types.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

const mocks = rs.hoisted(() => ({
  createFmtWorkerCalls: [] as [number, number | undefined][],
  formatFileSerialCalls: [] as FmtFileRequest[],
}));

rs.mock('../../src/fmt/parallel.ts', () => ({
  createFmtWorker: (fileCount: number, maxWorkers?: number) => {
    mocks.createFmtWorkerCalls.push([fileCount, maxWorkers]);
    return Promise.reject(new Error('worker startup failed'));
  },
}));

rs.mock('../../src/fmt/serial.ts', () => ({
  formatFileSerial: (file: FmtFileRequest) => {
    mocks.formatFileSerialCalls.push(file);
    return Promise.resolve(true);
  },
}));

beforeEach(() => {
  mocks.createFmtWorkerCalls.length = 0;
  mocks.formatFileSerialCalls.length = 0;
});

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

test('sends plugin URL requests to workers before writing', async () => {
  await withTempProject(async (rootPath) => {
    const filePaths = ['first.ts', 'second.ts'].map((name) =>
      writeProjectFile(rootPath, name, 'const value=1'),
    );

    await expect(
      runFmtFiles({
        files: filePaths.map((filePath) =>
          createRequest(filePath, ['file:///prettier-plugin-fixture.mjs']),
        ),
        mode: 'write',
        cache: false,
        parallel: true,
        maxWorkers: 3,
      }),
    ).rejects.toThrow('worker startup failed');

    expect(mocks.createFmtWorkerCalls).toEqual([[2, 3]]);
    expect(mocks.formatFileSerialCalls).toEqual([]);

    for (const filePath of filePaths) {
      expect(readFileSync(filePath, 'utf8')).toBe('const value=1');
    }
  });
});

test('uses serial execution when options cannot be cloned', async () => {
  await withTempProject(async (rootPath) => {
    const filePaths = ['first.ts', 'second.ts'].map((name) =>
      writeProjectFile(rootPath, name, 'const value=1'),
    );
    const files = filePaths.map((filePath) => createRequest(filePath));
    for (const file of files) {
      Object.assign(file.options, { customOption() {} });
    }

    const result = await runFmtFiles({
      files,
      mode: 'write',
      cache: false,
      parallel: true,
    });

    expect(result.files.map((file) => file.status)).toEqual(['written', 'written']);
    expect(mocks.createFmtWorkerCalls).toEqual([]);
    expect(mocks.formatFileSerialCalls).toEqual(files);
    for (const filePath of filePaths) {
      expect(readFileSync(filePath, 'utf8')).toBe('const value=1');
    }
  });
});
