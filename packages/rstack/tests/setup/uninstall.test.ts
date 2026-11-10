import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { installHooks } from '../../src/setup/install.ts';
import { uninstallHooks } from '../../src/setup/uninstall.ts';
import {
  git,
  hooksPath,
  restoreEnv,
  runGit,
  withDirectory,
  withRepository,
} from './helpers.ts';

test.each([
  ['default', undefined, hooksPath],
  ['custom', 'config/custom hooks', 'config/custom hooks/_'],
] as const)(
  'uninstalls a %s installation and preserves user hooks',
  (_, hooksDir, installedHooksPath) => {
    withRepository((cwd) => {
      const userHook = path.join(
        cwd,
        path.dirname(installedHooksPath),
        'pre-commit',
      );
      mkdirSync(path.dirname(userHook), { recursive: true });
      writeFileSync(userHook, 'echo user hook\n');

      expect(
        installHooks({ cwd, ...(hooksDir ? { hooksDir } : {}) }).status,
      ).toBe('installed');
      const originalValue = process.env.RSTACK_HOOKS;
      process.env.RSTACK_HOOKS = '0';

      try {
        expect(uninstallHooks({ cwd })).toEqual({
          status: 'uninstalled',
          hooksPath: installedHooksPath,
        });
      } finally {
        restoreEnv('RSTACK_HOOKS', originalValue);
      }

      expect(
        git(cwd, ['config', '--local', '--get', 'core.hooksPath']).status,
      ).toBe(1);
      expect(existsSync(path.join(cwd, installedHooksPath))).toBe(false);
      expect(readFileSync(userHook, 'utf8')).toBe('echo user hook\n');
      expect(uninstallHooks({ cwd }).status).toBe('unchanged');
    });
  },
);

test('uninstalls one linked worktree without affecting another', () => {
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
      'initial',
    ]);
    runGit(cwd, ['config', '--local', 'extensions.worktreeConfig', 'true']);
    expect(installHooks({ cwd }).status).toBe('installed');
    const mainHooksDirectory = path.join(cwd, hooksPath);
    runGit(cwd, ['config', '--local', 'core.hooksPath', mainHooksDirectory]);

    const linkedWorktree = path.join(cwd, 'linked');
    runGit(cwd, [
      'worktree',
      'add',
      '--quiet',
      '--detach',
      linkedWorktree,
      'HEAD',
    ]);
    runGit(linkedWorktree, [
      'config',
      '--worktree',
      'core.hooksPath',
      hooksPath,
    ]);
    expect(installHooks({ cwd: linkedWorktree }).status).toBe('installed');

    expect(uninstallHooks({ cwd: linkedWorktree }).status).toBe('uninstalled');
    expect(
      git(linkedWorktree, ['config', '--worktree', '--get', 'core.hooksPath'])
        .status,
    ).toBe(1);
    expect(runGit(cwd, ['config', '--local', '--get', 'core.hooksPath'])).toBe(
      mainHooksDirectory,
    );
    expect(existsSync(mainHooksDirectory)).toBe(true);
  });
});

test('refuses to remove hooks owned by another Rstack project', () => {
  withRepository((cwd) => {
    const frontend = path.join(cwd, 'frontend');
    const docs = path.join(cwd, 'docs');
    mkdirSync(frontend);
    mkdirSync(docs);

    expect(installHooks({ cwd: frontend }).status).toBe('installed');
    expect(uninstallHooks({ cwd: docs })).toMatchObject({
      status: 'failed',
      reason: 'owned-by-another-project',
    });
    expect(existsSync(path.join(cwd, hooksPath, 'runner'))).toBe(true);
  });
});

test('refuses to remove an unmanaged hooks directory', () => {
  withRepository((cwd) => {
    const unmanagedDirectory = path.join(cwd, '.husky', '_');
    const unmanagedHook = path.join(unmanagedDirectory, 'pre-commit');
    mkdirSync(unmanagedDirectory, { recursive: true });
    writeFileSync(unmanagedHook, '#!/usr/bin/env sh\n');
    runGit(cwd, ['config', '--local', 'core.hooksPath', '.husky/_']);

    expect(uninstallHooks({ cwd })).toMatchObject({
      status: 'failed',
      reason: 'hooks-directory-conflict',
    });
    expect(readFileSync(unmanagedHook, 'utf8')).toBe('#!/usr/bin/env sh\n');
  });
});

test('is unchanged outside a Git repository', () => {
  withDirectory((cwd) => {
    expect(uninstallHooks({ cwd })).toEqual({
      status: 'unchanged',
      reason: 'not-git-repository',
    });
    expect(existsSync(path.join(cwd, '.rstack'))).toBe(false);
  });
});

test.each([
  [
    'unsetting fails',
    (cwd: string) => writeFileSync(path.join(cwd, '.git', 'config.lock'), ''),
  ],
  [
    'the path remains active',
    (cwd: string) =>
      runGit(cwd, ['config', '--global', 'core.hooksPath', hooksPath]),
  ],
] as const)('preserves generated hooks when %s', (_, arrangeFailure) => {
  withRepository((cwd) => {
    expect(installHooks({ cwd }).status).toBe('installed');
    arrangeFailure(cwd);

    expect(uninstallHooks({ cwd })).toMatchObject({
      status: 'failed',
      reason: 'git-config-failed',
    });
    expect(existsSync(path.join(cwd, hooksPath, 'runner'))).toBe(true);
  });
});
