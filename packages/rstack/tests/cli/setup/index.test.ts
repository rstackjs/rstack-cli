import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach } from 'rstack/test';
import { test } from '#test-helpers';

let cwd: string;
let env: NodeJS.ProcessEnv;

const git = (args: string[]): string => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env });
  if (result.status !== 0) {
    throw new Error(result.stderr || `Git exited with status ${result.status}`);
  }
  return result.stdout.trim();
};

beforeEach(() => {
  cwd = mkdtempSync(path.join(import.meta.dirname, 'test-temp-rstack setup '));
  env = {
    ...process.env,
    GIT_CEILING_DIRECTORIES: import.meta.dirname,
    GIT_CONFIG_GLOBAL: path.join(cwd, 'global.gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
  };
});

afterEach(() => {
  rmSync(cwd, { force: true, recursive: true });
});

test('keeps setup as a compatibility alias', ({ execCli, expect }) => {
  git(['init', '--quiet']);

  const help = execCli('setup --help', { cwd, env });
  expect(execCli('setup -h', { cwd, env })).toBe(help);
  expect(help).toContain('$ rs setup [options]');

  expect(execCli('setup --hooks-dir "compat hooks"', { cwd, env })).toBe('');
  expect(git(['config', '--local', '--get', 'core.hooksPath'])).toBe(
    'compat hooks/_',
  );
  expect(existsSync(path.join(cwd, 'compat hooks', '_', 'runner'))).toBe(true);
  expect(execCli('hooks --hooks-dir "compat hooks"', { cwd, env })).toBe('');
});
