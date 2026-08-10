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
    expect(existsSync(path.join(projectDirectory, '.rstack'))).toBe(false);
    expect(readFileSync(path.join(cwd, hooksPath, '.owner'), 'utf8')).toBe('frontend\n');

    expect(runHook(cwd).status).toBe(0);
    expect(readFileSync(path.join(projectDirectory, 'nested-hook-ran'), 'utf8')).toBe('ran\n');
  });
});

test('installs a root-relative custom hooks directory from a nested project', () => {
  withRepository((cwd) => {
    const projectDirectory = path.join(cwd, 'frontend app');
    mkdirSync(projectDirectory);
    writeHook(cwd, "printf 'ran\\n' > custom-hook-ran\n", 'config/hooks');

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
    expect(existsSync(path.join(projectDirectory, 'config'))).toBe(false);
    expect(runHook(cwd).status).toBe(0);
    expect(readFileSync(path.join(projectDirectory, 'custom-hook-ran'), 'utf8')).toBe('ran\n');
  });
});

test('does not replace another Rstack project owner', () => {
  withRepository((cwd) => {
    const frontend = path.join(cwd, 'frontend');
    const docs = path.join(cwd, 'docs');
    mkdirSync(frontend);
    mkdirSync(docs);
    writeHook(cwd, 'printf \'%s\\n\' "$PWD" > hook-cwd\n');

    expect(installHooks({ cwd: frontend }).status).toBe('installed');
    expect(installHooks({ cwd: docs })).toEqual({
      status: 'skipped',
      reason: 'owned-by-another-project',
      message: 'Git hooks are already managed by Rstack project "frontend"',
    });
    expect(readFileSync(path.join(cwd, hooksPath, '.owner'), 'utf8')).toBe('frontend\n');

    expect(runHook(cwd).status).toBe(0);
    expect(readFileSync(path.join(frontend, 'hook-cwd'), 'utf8')).toBe(`${frontend}\n`);
    expect(existsSync(path.join(docs, 'hook-cwd'))).toBe(false);
  });
});

test('installs generated hooks relative to the current worktree', () => {
  withRepository((cwd) => {
    runGit(cwd, [
      '-c',
      'user.name=Rstack',
      '-c',
      'user.email=rstack@example.com',
      'commit',
      '--allow-empty',
      '--quiet',
      '-m',
      'Initial commit',
    ]);
    const worktree = path.join(cwd, 'linked', 'secondary');
    mkdirSync(path.dirname(worktree), { recursive: true });
    runGit(cwd, ['worktree', 'add', '--quiet', '-b', 'secondary', worktree]);

    const projectDirectory = path.join(worktree, 'frontend');
    mkdirSync(projectDirectory);
    writeHook(worktree, "printf 'ran\\n' > worktree-hook-ran\n");

    expect(installHooks({ cwd: projectDirectory }).status).toBe('installed');
    expect(existsSync(path.join(worktree, hooksPath, 'runner'))).toBe(true);
    expect(existsSync(path.join(cwd, hooksPath, 'runner'))).toBe(false);

    expect(runHook(worktree).status).toBe(0);
    expect(readFileSync(path.join(projectDirectory, 'worktree-hook-ran'), 'utf8')).toBe('ran\n');
  });
});
