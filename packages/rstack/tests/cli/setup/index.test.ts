import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'rstack/test';
import { RSTACK_BIN_PATH, test } from '#test-helpers';

const hooksPath = '.rstack/hooks/_';

let cwd: string;
let env: NodeJS.ProcessEnv;

const git = (args: string[]): string => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env });
  if (result.status !== 0) {
    throw new Error(result.stderr || `Git exited with status ${result.status}`);
  }
  return result.stdout.trim();
};

const initRepository = (): void => {
  git(['init', '--quiet']);
  git(['config', '--local', 'user.name', 'Rstack Test']);
  git(['config', '--local', 'user.email', 'test@rstack.dev']);
};

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'rstack setup '));
  env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: path.join(cwd, 'global.gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
  };
});

afterEach(() => {
  rmSync(cwd, { force: true, recursive: true });
});

test('displays setup help', ({ execCli, expect }) => {
  expect(execCli('--help', { cwd })).toContain('setup    Install Git hooks');

  const output = execCli('setup --help', { cwd });

  expect(execCli('setup -h', { cwd })).toBe(output);
  expect(output).toContain('Usage:\n  $ rs setup [options]');
  expect(output).toContain('-h, --help');
});

test('rejects unknown setup options', ({ execCli, expect }) => {
  expect(() => execCli('setup --unknown', { cwd })).toThrow();
});

test('installs hooks without loading Rstack config', ({ execCli, expect }) => {
  initRepository();
  writeFileSync(path.join(cwd, 'rstack.config.ts'), 'throw new Error("must not load");\n');

  expect(execCli('setup', { cwd, env })).toContain('Git hooks installed.');
  expect(git(['config', '--local', '--get', 'core.hooksPath'])).toBe(hooksPath);
  expect(existsSync(path.join(cwd, hooksPath, 'runner'))).toBe(true);
  expect(existsSync(path.join(cwd, '.rstack', 'hooks', 'pre-commit'))).toBe(false);

  expect(execCli('setup', { cwd, env })).toContain('Git hooks are already installed.');
});

test('skips non-Git directories without creating files', ({ execCli, expect }) => {
  expect(execCli('setup', { cwd })).toContain('Git hooks setup skipped: not a Git repository.');
  expect(existsSync(path.join(cwd, '.rstack'))).toBe(false);
});

test('skips setup when hooks are disabled', ({ execCli, expect }) => {
  const output = execCli('setup', { cwd, env: { ...env, RSTACK_HOOKS: '0' } });

  expect(output).toContain('Git hooks setup skipped: disabled by RSTACK_HOOKS.');
  expect(existsSync(path.join(cwd, '.rstack'))).toBe(false);
});

test('exits with an error when Git is unavailable', ({ expect }) => {
  const result = spawnSync(process.execPath, [RSTACK_BIN_PATH, 'setup'], {
    cwd,
    encoding: 'utf8',
    env: { ...env, PATH: '', Path: '' },
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Git command not found.');
});
