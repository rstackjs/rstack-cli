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

test.each([false, true])(
  'releases rules only after all traversals settle (failure: %s)',
  async (fail) => {
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
          return fail
            ? Promise.reject(error)
            : Promise.resolve({ files: [firstFile] });
        }
        started.resolve();
        return pending.promise;
      });

      const discovery = discoverFmtPaths({
        cwd: rootPath,
        patterns: ['first', 'second'],
      });
      const completion = fail
        ? expect(discovery).rejects.toBe(error)
        : expect(discovery).resolves.toEqual([firstFile, secondFile]);
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
  },
);

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
