import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { createHookFiles } from '../../src/setup/hooks.ts';
import { installHooks } from '../../src/setup/install.ts';

const hooksPath = '.rstack/hooks/_';

const git = (cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env) =>
  spawnSync('git', args, { cwd, encoding: 'utf8', env });

const runGit = (cwd: string, args: string[]): string => {
  const result = git(cwd, args);
  if (result.status !== 0) {
    throw new Error(result.stderr || `Git exited with status ${result.status}`);
  }
  return result.stdout.trim();
};

const withDirectory = (callback: (cwd: string) => void): void => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'rstack hooks '));
  try {
    callback(cwd);
  } finally {
    rmSync(cwd, { force: true, recursive: true });
  }
};

const restoreEnv = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
};

const hookEnv = (cwd: string, value?: string): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(cwd, '.git', 'xdg'),
  };

  if (value !== undefined) {
    env.RSTACK_HOOKS = value;
  }

  return env;
};

const writeHook = (cwd: string, content: string): void => {
  const filePath = path.join(cwd, '.rstack', 'hooks', 'pre-commit');
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
};

const writeInit = (cwd: string, content: string): void => {
  const filePath = path.join(cwd, '.git', 'xdg', 'rstack', 'hooks-init.sh');
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
};

const stage = (cwd: string, name: string): void => {
  writeFileSync(path.join(cwd, name), 'content\n');
  runGit(cwd, ['add', name]);
};

const commit = (cwd: string, value?: string) =>
  git(cwd, ['commit', '--quiet', '-m', 'test'], hookEnv(cwd, value));

const withRepository = (callback: (cwd: string) => void): void =>
  withDirectory((cwd) => {
    const globalConfig = process.env.GIT_CONFIG_GLOBAL;
    const noSystemConfig = process.env.GIT_CONFIG_NOSYSTEM;
    process.env.GIT_CONFIG_GLOBAL = path.join(cwd, 'global.gitconfig');
    process.env.GIT_CONFIG_NOSYSTEM = '1';

    try {
      runGit(cwd, ['init', '--quiet']);
      runGit(cwd, ['config', '--local', 'user.name', 'Rstack Test']);
      runGit(cwd, ['config', '--local', 'user.email', 'test@rstack.dev']);
      callback(cwd);
    } finally {
      restoreEnv('GIT_CONFIG_GLOBAL', globalConfig);
      restoreEnv('GIT_CONFIG_NOSYSTEM', noSystemConfig);
    }
  });

test('installs generated hooks and configures the repository', () => {
  withRepository((cwd) => {
    expect(installHooks(cwd)).toEqual({ status: 'installed', hooksPath });
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

    expect(installHooks(cwd).status).toBe('installed');
    expect(installHooks(cwd)).toEqual({ status: 'unchanged', hooksPath });

    expect(readFileSync(userHook, 'utf8')).toBe('echo user hook\n');
    expect(existsSync(path.join(userDirectory, 'commit-msg'))).toBe(false);
  });
});

test.runIf(process.platform !== 'win32')('restores executable mode on existing shims', () => {
  withRepository((cwd) => {
    expect(installHooks(cwd).status).toBe('installed');
    const shim = path.join(cwd, hooksPath, 'pre-commit');
    chmodSync(shim, 0o644);

    expect(installHooks(cwd).status).toBe('installed');
    expect(statSync(shim).mode & 0o777).toBe(0o755);
  });
});

test('skips non-Git directories without creating files', () => {
  withDirectory((cwd) => {
    expect(installHooks(cwd)).toEqual({
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
      expect(installHooks(cwd)).toEqual({
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

    expect(installHooks(cwd)).toMatchObject({
      status: 'failed',
      reason: 'write-failed',
    });
    expect(git(cwd, ['config', '--local', '--get', 'core.hooksPath']).status).toBe(1);
  });
});

test('reports Git configuration failures without changing hooksPath', () => {
  withRepository((cwd) => {
    writeFileSync(path.join(cwd, '.git', 'config.lock'), 'locked');

    expect(installHooks(cwd)).toMatchObject({
      status: 'failed',
      reason: 'git-config-failed',
    });
    expect(git(cwd, ['config', '--local', '--get', 'core.hooksPath']).status).toBe(1);
    expect(existsSync(path.join(cwd, hooksPath, 'runner'))).toBe(true);
  });
});

test('loads user init and project binaries', () => {
  withRepository((cwd) => {
    const binDirectory = path.join(cwd, 'node_modules', '.bin');
    mkdirSync(binDirectory, { recursive: true });
    writeInit(cwd, 'set -u\nexport RSTACK_INIT=loaded\n');

    const command = path.join(binDirectory, 'rstack-hook-command');
    writeFileSync(
      command,
      `#!/usr/bin/env sh
printf 'ran\\n' > project-bin-ran
`,
    );
    chmodSync(command, 0o755);

    writeHook(
      cwd,
      `printf '%s\\n' "$RSTACK_INIT" > init-ran
rstack-hook-command
`,
    );

    expect(installHooks(cwd).status).toBe('installed');
    stage(cwd, 'file.txt');

    expect(commit(cwd).status).toBe(0);
    expect(readFileSync(path.join(cwd, 'init-ran'), 'utf8')).toBe('loaded\n');
    expect(readFileSync(path.join(cwd, 'project-bin-ran'), 'utf8')).toBe('ran\n');
  });
});

test('skips user hooks when disabled by the environment or init', () => {
  withRepository((cwd) => {
    writeHook(cwd, 'echo ran >> hook-ran\n');
    expect(installHooks(cwd).status).toBe('installed');

    stage(cwd, 'first.txt');
    expect(commit(cwd, '0').status).toBe(0);
    expect(existsSync(path.join(cwd, 'hook-ran'))).toBe(false);

    writeInit(cwd, 'set -u\nexport RSTACK_HOOKS=0\n');

    stage(cwd, 'second.txt');
    expect(commit(cwd).status).toBe(0);
    expect(existsSync(path.join(cwd, 'hook-ran'))).toBe(false);
  });
});

test('traces and reports hook failures and command lookup errors', () => {
  withRepository((cwd) => {
    writeHook(cwd, 'exit 23\n');
    expect(installHooks(cwd).status).toBe('installed');
    stage(cwd, 'file.txt');

    const failed = commit(cwd, '2');
    expect(failed.stderr).toContain('+ sh -e');
    expect(`${failed.stdout}${failed.stderr}`).toContain(
      'Rstack - pre-commit hook failed (code 23)',
    );

    writeHook(
      cwd,
      `printf '%s\\n' "$PATH" > hook-path
missing-command
`,
    );
    const missing = commit(cwd);
    const actualPath = readFileSync(path.join(cwd, 'hook-path'), 'utf8').trim();
    const output = `${missing.stdout}${missing.stderr}`;

    expect(output).toContain('Rstack - pre-commit hook failed (code 127)');
    expect(output).toContain(`Rstack - command not found in PATH=${actualPath}`);
    expect(git(cwd, ['rev-parse', '--verify', 'HEAD']).status).not.toBe(0);
  });
});
