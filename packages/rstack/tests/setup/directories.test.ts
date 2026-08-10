import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { installHooks } from '../../src/setup/install.ts';
import { hooksPath, runGit, runHook, withRepository, writeHook } from './helpers.ts';

test('installs a custom hooks directory from the Git root and runs its hook', () => {
  withRepository((cwd) => {
    const customHooksDir = 'frontend/custom hooks';
    const customHooksPath = `${customHooksDir}/_`;
    writeHook(cwd, "printf 'ran\\n' > custom-hook-ran\n", customHooksDir);

    expect(installHooks({ cwd, hooksDir: customHooksDir })).toEqual({
      status: 'installed',
      hooksPath: customHooksPath,
    });
    expect(runGit(cwd, ['config', '--local', '--get', 'core.hooksPath'])).toBe(customHooksPath);
    expect(existsSync(path.join(cwd, customHooksPath, 'runner'))).toBe(true);

    expect(runHook(cwd).status).toBe(0);
    expect(readFileSync(path.join(cwd, 'custom-hook-ran'), 'utf8')).toBe('ran\n');
  });
});

test('installs repository-level hooks from a nested project', () => {
  withRepository((cwd) => {
    const projectDirectory = path.join(cwd, 'frontend');
    mkdirSync(projectDirectory);
    writeHook(cwd, "printf 'ran\\n' > nested-hook-ran\n");

    expect(installHooks({ cwd: projectDirectory })).toEqual({
      status: 'installed',
      hooksPath,
    });
    expect(installHooks({ cwd: projectDirectory })).toEqual({
      status: 'unchanged',
      hooksPath,
    });
    expect(runGit(cwd, ['config', '--local', '--get', 'core.hooksPath'])).toBe(hooksPath);
    expect(existsSync(path.join(cwd, hooksPath, 'runner'))).toBe(true);
    expect(readFileSync(path.join(cwd, hooksPath, '.owner'), 'utf8')).toBe('frontend\n');

    expect(runHook(cwd).status).toBe(0);
    expect(readFileSync(path.join(projectDirectory, 'nested-hook-ran'), 'utf8')).toBe('ran\n');
  });
});

test('installs a root-relative custom hooks directory from a nested project', () => {
  withRepository((cwd) => {
    const projectDirectory = path.join(cwd, 'frontend app');
    mkdirSync(projectDirectory);

    expect(installHooks({ cwd: projectDirectory, hooksDir: 'config\\hooks' })).toEqual({
      status: 'installed',
      hooksPath: 'config/hooks/_',
    });
    expect(installHooks({ cwd: projectDirectory, hooksDir: 'config\\hooks' })).toEqual({
      status: 'unchanged',
      hooksPath: 'config/hooks/_',
    });
    expect(runGit(cwd, ['config', '--local', '--get', 'core.hooksPath'])).toBe('config/hooks/_');
    expect(existsSync(path.join(cwd, 'config', 'hooks', '_', 'runner'))).toBe(true);
  });
});
