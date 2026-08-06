import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { createHookFiles } from '../../src/setup/hooks.ts';
import { installHooks } from '../../src/setup/install.ts';
import { git, hooksPath, restoreEnv, runGit, withDirectory, withRepository } from './helpers.ts';

test('installs generated hooks and configures the repository', () => {
  withRepository((cwd) => {
    expect(installHooks({ cwd })).toEqual({ status: 'installed', hooksPath });
    expect(runGit(cwd, ['config', '--local', '--get', 'core.hooksPath'])).toBe(hooksPath);

    const directory = path.join(cwd, hooksPath);
    expect(readFileSync(path.join(directory, '.gitignore'), 'utf8')).toBe('*\n');
    expect(runGit(cwd, ['status', '--short', '--untracked-files=all'])).toBe('');

    for (const [name, content] of Object.entries(createHookFiles())) {
      const filePath = path.join(directory, name);
      expect(readFileSync(filePath, 'utf8')).toBe(content);
      if (process.platform !== 'win32') {
        expect(statSync(filePath).mode & 0o777).toBe(0o755);
      }
    }
  });
});

test('is idempotent and preserves user hooks', () => {
  withRepository((cwd) => {
    const userDirectory = path.join(cwd, '.rstack', 'hooks');
    const userHook = path.join(userDirectory, 'pre-commit');
    mkdirSync(userDirectory, { recursive: true });
    writeFileSync(userHook, 'echo user hook\n');

    expect(installHooks({ cwd }).status).toBe('installed');
    expect(installHooks({ cwd })).toEqual({ status: 'unchanged', hooksPath });

    expect(readFileSync(userHook, 'utf8')).toBe('echo user hook\n');
    expect(existsSync(path.join(userDirectory, 'commit-msg'))).toBe(false);
  });
});

test.runIf(process.platform !== 'win32')('restores executable mode on existing shims', () => {
  withRepository((cwd) => {
    expect(installHooks({ cwd }).status).toBe('installed');
    const shim = path.join(cwd, hooksPath, 'pre-commit');
    chmodSync(shim, 0o644);

    expect(installHooks({ cwd }).status).toBe('installed');
    expect(statSync(shim).mode & 0o777).toBe(0o755);
  });
});

test('repairs generated files without rewriting an unchanged hooksPath', () => {
  withRepository((cwd) => {
    expect(installHooks({ cwd }).status).toBe('installed');
    const runner = path.join(cwd, hooksPath, 'runner');
    writeFileSync(runner, 'stale\n');
    writeFileSync(path.join(cwd, '.git', 'config.lock'), 'locked');

    expect(installHooks({ cwd })).toEqual({ status: 'installed', hooksPath });
    expect(readFileSync(runner, 'utf8')).toBe(createHookFiles().runner);
  });
});

test('skips non-Git directories without creating files', () => {
  withDirectory((cwd) => {
    expect(installHooks({ cwd })).toEqual({
      status: 'skipped',
      reason: 'not-git-repository',
    });
    expect(existsSync(path.join(cwd, '.rstack'))).toBe(false);
  });
});

test('reports when Git is unavailable', () => {
  withDirectory((cwd) => {
    const originalPath = process.env.PATH;
    process.env.PATH = '';
    try {
      expect(installHooks({ cwd })).toEqual({
        status: 'failed',
        reason: 'git-not-found',
        message: 'Git command not found.',
      });
    } finally {
      restoreEnv('PATH', originalPath);
    }
  });
});

test('does not configure Git when writing generated files fails', () => {
  withRepository((cwd) => {
    writeFileSync(path.join(cwd, '.rstack'), 'not a directory');

    expect(installHooks({ cwd })).toMatchObject({
      status: 'failed',
      reason: 'write-failed',
    });
    expect(git(cwd, ['config', '--local', '--get', 'core.hooksPath']).status).toBe(1);
  });
});

test('reports Git configuration failures without changing hooksPath', () => {
  withRepository((cwd) => {
    writeFileSync(path.join(cwd, '.git', 'config.lock'), 'locked');

    expect(installHooks({ cwd })).toMatchObject({
      status: 'failed',
      reason: 'git-config-failed',
    });
    expect(git(cwd, ['config', '--local', '--get', 'core.hooksPath']).status).toBe(1);
    expect(existsSync(path.join(cwd, hooksPath, 'runner'))).toBe(true);
  });
});
