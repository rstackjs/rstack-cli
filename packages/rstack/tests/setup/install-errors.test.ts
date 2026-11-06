import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, rs, test } from 'rstack/test';
import { installHooks } from '../../src/setup/install.ts';
import { git, hooksPath, withRepository } from './helpers.ts';

rs.mock('node:fs', () => {
  const actual = rs.requireActual<typeof import('node:fs')>('node:fs');
  return { ...actual, writeFileSync: rs.fn(actual.writeFileSync) };
});

afterEach(() => {
  rs.mocked(writeFileSync).mockReset();
});

test('handles cross-realm owner file conflicts', () => {
  withRepository((cwd) => {
    const error: unknown = runInNewContext(
      'Object.assign(new Error("owner file exists"), { code: "EEXIST" })',
    );
    expect(error instanceof Error).toBe(false);
    rs.mocked(writeFileSync).mockImplementationOnce(() => {
      throw error;
    });

    expect(installHooks({ cwd })).toMatchObject({
      status: 'skipped',
      reason: 'hooks-directory-conflict',
    });
    expect(existsSync(path.join(cwd, hooksPath, 'runner'))).toBe(false);
    expect(
      git(cwd, ['config', '--local', '--get', 'core.hooksPath']).status,
    ).toBe(1);
  });
});

test('preserves the message of cross-realm filesystem errors', () => {
  withRepository((cwd) => {
    const error: unknown = runInNewContext(
      'Object.assign(new Error("permission denied"), { code: "EACCES" })',
    );
    expect(error instanceof Error).toBe(false);
    rs.mocked(writeFileSync).mockImplementationOnce(() => {
      throw error;
    });

    expect(installHooks({ cwd })).toEqual({
      status: 'failed',
      reason: 'write-failed',
      message: 'Failed to write Git hook files: permission denied',
    });
  });
});
