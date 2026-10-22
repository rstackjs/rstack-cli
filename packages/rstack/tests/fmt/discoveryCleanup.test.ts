import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { afterEach, expect, rs, test } from 'rstack/test';
import { discoverFmtPaths } from '../../src/fmt/discoverPaths.ts';
import { loadNativeBinding } from '../../src/native/index.ts';
import { withTempProject, writeProjectFile } from './helpers.ts';

const mocks = rs.hoisted(() => ({ readdir: rs.fn() }));
rs.mock('tiny-readdir', () => ({ default: mocks.readdir }));

afterEach(() => {
  rs.restoreAllMocks();
  mocks.readdir.mockReset();
});

test('waits for pending traversals before releasing rules after a failure', async () => {
  await withTempProject(async (rootPath) => {
    writeProjectFile(rootPath, '.gitignore', '*.log\n');
    const firstFile = writeProjectFile(rootPath, 'first/index.ts');
    const secondFile = writeProjectFile(rootPath, 'second/index.ts');
    const pending = Promise.withResolvers<{ files: string[] }>();
    const started = Promise.withResolvers<void>();
    const error = new Error('Traversal failed');
    const clear = rs.spyOn(
      loadNativeBinding().GitIgnoreMatcher.prototype,
      'clear',
    );

    mocks.readdir.mockImplementation((directory: string) => {
      if (directory === path.dirname(firstFile)) {
        return Promise.reject(error);
      }
      started.resolve();
      return pending.promise;
    });

    const discovery = discoverFmtPaths({
      cwd: rootPath,
      patterns: ['first', 'second'],
    });
    const completion = expect(discovery).rejects.toBe(error);
    try {
      await started.promise;
      // Let a sibling rejection propagate while this traversal is still pending.
      await setImmediate();
      expect(clear).not.toHaveBeenCalled();
    } finally {
      pending.resolve({ files: [secondFile] });
      await completion;
    }
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

test('releases rules when initialization fails', async () => {
  await withTempProject(async (rootPath) => {
    writeProjectFile(rootPath, '.gitignore', '*.log\n');
    const prototype = loadNativeBinding().GitIgnoreMatcher.prototype;
    const error = new Error('Invalid ignore source');
    rs.spyOn(prototype, 'addSource').mockImplementation(() => {
      throw error;
    });
    const clear = rs.spyOn(prototype, 'clear');

    await expect(discoverFmtPaths({ cwd: rootPath })).rejects.toBe(error);
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
