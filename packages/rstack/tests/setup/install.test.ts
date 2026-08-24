import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { createHookFiles } from '../../src/setup/hooks.ts';
import { installHooks } from '../../src/setup/install.ts';
import {
  git,
  hooksPath,
  restoreEnv,
  runGit,
  withRepository,
} from './helpers.ts';

test('installs generated hooks and configures the repository', () => {
  withRepository((cwd) => {
    expect(installHooks({ cwd })).toEqual({ status: 'installed', hooksPath });
    expect(runGit(cwd, ['config', '--local', '--get', 'core.hooksPath'])).toBe(
      hooksPath,
    );

    const directory = path.join(cwd, hooksPath);
    expect(readFileSync(path.join(directory, '.gitignore'), 'utf8')).toBe(
      '*\n',
    );
    expect(readFileSync(path.join(directory, '.owner'), 'utf8')).toBe('.\n');
    expect(runGit(cwd, ['status', '--short', '--untracked-files=all'])).toBe(
      '',
    );

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

test.runIf(process.platform !== 'win32')(
  'restores executable mode on existing shims',
  () => {
    withRepository((cwd) => {
      expect(installHooks({ cwd }).status).toBe('installed');
      const shim = path.join(cwd, hooksPath, 'pre-commit');
      chmodSync(shim, 0o644);

      expect(installHooks({ cwd }).status).toBe('installed');
      expect(statSync(shim).mode & 0o777).toBe(0o755);
    });
  },
);

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

test('resolves repository context with a single Git process when unchanged', () => {
  withRepository((cwd) => {
    expect(installHooks({ cwd }).status).toBe('installed');
    const tracePath = path.join(cwd, 'git-trace.json');
    const originalTrace = process.env.GIT_TRACE2_EVENT;
    process.env.GIT_TRACE2_EVENT = tracePath;

    try {
      expect(installHooks({ cwd })).toEqual({ status: 'unchanged', hooksPath });
    } finally {
      restoreEnv('GIT_TRACE2_EVENT', originalTrace);
    }

    const starts = readFileSync(tracePath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { argv: string[]; event: string })
      .filter((event) => event.event === 'start');
    expect(starts).toHaveLength(1);
    expect(starts[0].argv).toContain('rev-parse');
  });
});

test('does not configure Git when writing generated files fails', () => {
  withRepository((cwd) => {
    writeFileSync(path.join(cwd, '.rstack'), 'not a directory');

    expect(installHooks({ cwd })).toMatchObject({
      status: 'failed',
      reason: 'write-failed',
    });
    expect(
      git(cwd, ['config', '--local', '--get', 'core.hooksPath']).status,
    ).toBe(1);
  });
});

test('reports Git configuration failures without changing hooksPath', () => {
  withRepository((cwd) => {
    writeFileSync(path.join(cwd, '.git', 'config.lock'), 'locked');

    expect(installHooks({ cwd })).toMatchObject({
      status: 'failed',
      reason: 'git-config-failed',
    });
    expect(
      git(cwd, ['config', '--local', '--get', 'core.hooksPath']).status,
    ).toBe(1);
    expect(existsSync(path.join(cwd, hooksPath, 'runner'))).toBe(true);
  });
});

test('requires force to replace another Git hooks path', () => {
  withRepository((cwd) => {
    const existingDirectory = path.join(cwd, '.husky', '_');
    const existingHook = path.join(existingDirectory, 'pre-commit');
    mkdirSync(existingDirectory, { recursive: true });
    writeFileSync(existingHook, '#!/usr/bin/env sh\n');
    runGit(cwd, ['config', '--local', 'core.hooksPath', '.husky/_']);

    expect(installHooks({ cwd })).toMatchObject({
      status: 'skipped',
      reason: 'hooks-path-conflict',
    });
    expect(runGit(cwd, ['config', '--local', '--get', 'core.hooksPath'])).toBe(
      '.husky/_',
    );
    expect(existsSync(path.join(cwd, hooksPath))).toBe(false);

    expect(installHooks({ cwd, force: true })).toEqual({
      status: 'installed',
      hooksPath,
      inactiveHooks: {
        hooks: ['pre-commit'],
        path: '.husky/_',
        restore: 'configure',
      },
    });
    expect(runGit(cwd, ['config', '--local', '--get', 'core.hooksPath'])).toBe(
      hooksPath,
    );
    expect(readFileSync(existingHook, 'utf8')).toBe('#!/usr/bin/env sh\n');
  });
});

test('requires force to bypass existing Git hooks', () => {
  withRepository((cwd) => {
    const existingHook = path.join(cwd, '.git', 'hooks', 'pre-commit');
    writeFileSync(existingHook, '#!/usr/bin/env sh\n');

    expect(installHooks({ cwd })).toEqual({
      status: 'skipped',
      reason: 'existing-git-hooks',
      message: 'existing Git hooks were found: pre-commit',
    });
    expect(
      git(cwd, ['config', '--local', '--get', 'core.hooksPath']).status,
    ).toBe(1);

    expect(installHooks({ cwd, force: true })).toEqual({
      status: 'installed',
      hooksPath,
      inactiveHooks: {
        hooks: ['pre-commit'],
        path: '.git/hooks',
        restore: 'unset',
      },
    });
    expect(runGit(cwd, ['config', '--local', '--get', 'core.hooksPath'])).toBe(
      hooksPath,
    );
    expect(readFileSync(existingHook, 'utf8')).toBe('#!/usr/bin/env sh\n');
  });
});

test('force does not replace hooks owned by another Rstack project', () => {
  withRepository((cwd) => {
    const frontend = path.join(cwd, 'frontend');
    const docs = path.join(cwd, 'docs');
    mkdirSync(frontend);
    mkdirSync(docs);

    expect(installHooks({ cwd: frontend }).status).toBe('installed');
    expect(installHooks({ cwd: docs, force: true })).toMatchObject({
      status: 'skipped',
      reason: 'owned-by-another-project',
    });
    expect(readFileSync(path.join(cwd, hooksPath, '.owner'), 'utf8')).toBe(
      'frontend\n',
    );
  });
});

test('force does not replace an invalid Rstack hooks directory', () => {
  withRepository((cwd) => {
    const directory = path.join(cwd, hooksPath);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, '.owner'), 'invalid');

    expect(installHooks({ cwd, force: true })).toMatchObject({
      status: 'skipped',
      reason: 'hooks-directory-conflict',
    });
    expect(
      git(cwd, ['config', '--local', '--get', 'core.hooksPath']).status,
    ).toBe(1);
    expect(existsSync(path.join(directory, 'runner'))).toBe(false);
  });
});
