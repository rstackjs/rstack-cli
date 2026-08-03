import { chmodSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { runFmtFiles } from '../../src/fmt/runner.ts';
import type { FmtFileRequest, FmtMode } from '../../src/fmt/types.ts';
import { withTempProject } from './helpers.ts';

const createRequest = (filePath: string): FmtFileRequest => ({
  path: filePath,
  options: {
    filepath: filePath,
    parser: 'typescript',
  },
});

const run = (files: FmtFileRequest[], mode: FmtMode = 'write') =>
  runFmtFiles({
    files,
    mode,
    cache: false,
  });

test('does not rewrite unchanged files', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = path.join(rootPath, 'unchanged.ts');
    const timestamp = new Date('2020-01-01T00:00:00.000Z');
    writeFileSync(filePath, 'const value = 1;\n');
    utimesSync(filePath, timestamp, timestamp);
    const mtimeMs = statSync(filePath).mtimeMs;

    const result = await run([createRequest(filePath)]);

    expect(result).toMatchObject({
      exitCode: 0,
      files: [{ path: filePath, status: 'unchanged' }],
    });
    expect(statSync(filePath).mtimeMs).toBe(mtimeMs);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.files[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});

test('writes changed files', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = path.join(rootPath, 'changed.ts');
    writeFileSync(filePath, 'const value=1');

    const result = await run([createRequest(filePath)]);

    expect(result).toMatchObject({
      exitCode: 0,
      files: [{ path: filePath, status: 'written' }],
    });
    expect(readFileSync(filePath, 'utf8')).toBe('const value = 1;\n');
  });
});

test.runIf(process.platform !== 'win32')('preserves file mode when writing', async () => {
  await withTempProject(async (rootPath) => {
    const filePath = path.join(rootPath, 'executable.ts');
    writeFileSync(filePath, 'const value=1');
    chmodSync(filePath, 0o744);

    await run([createRequest(filePath)]);

    expect(statSync(filePath).mode & 0o777).toBe(0o744);
  });
});

for (const mode of ['check', 'list-different'] as const) {
  test(`${mode} reports differences without writing`, async () => {
    await withTempProject(async (rootPath) => {
      const filePath = path.join(rootPath, 'different.ts');
      const source = 'const value=1';
      writeFileSync(filePath, source);

      const result = await run([createRequest(filePath)], mode);

      expect(result).toMatchObject({
        exitCode: 1,
        files: [{ path: filePath, status: 'different' }],
      });
      expect(readFileSync(filePath, 'utf8')).toBe(source);
    });
  });
}

test('continues after a file fails and gives errors exit-code precedence', async () => {
  await withTempProject(async (rootPath) => {
    const invalidPath = path.join(rootPath, 'invalid.ts');
    const validPath = path.join(rootPath, 'valid.ts');
    writeFileSync(invalidPath, 'const value = ;');
    writeFileSync(validPath, 'const value=1');

    const result = await run([createRequest(invalidPath), createRequest(validPath)], 'check');

    expect(result).toMatchObject({
      exitCode: 2,
      files: [
        { path: invalidPath, status: 'error' },
        { path: validPath, status: 'different' },
      ],
    });
    expect(readFileSync(validPath, 'utf8')).toBe('const value=1');
  });
});
