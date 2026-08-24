import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach } from 'rstack/test';
import { normalizeHelpOutput, RSTACK_BIN_PATH, test } from '#test-helpers';

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
};

const runSetup = (args: string[], runCwd: string = cwd) =>
  spawnSync(process.execPath, [RSTACK_BIN_PATH, 'setup', ...args], {
    cwd: runCwd,
    encoding: 'utf8',
    env,
  });

const runSetupSuccessfully = (args: string[], runCwd: string = cwd): string => {
  const result = runSetup(args, runCwd);
  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.error?.message || `Exited with ${result.status}`,
    );
  }
  return `${result.stdout}${result.stderr}`;
};

beforeEach(() => {
  cwd = mkdtempSync(path.join(import.meta.dirname, 'test-temp-rstack setup '));
  env = {
    ...process.env,
    // Keep Git from treating the fixture as part of this repository.
    GIT_CEILING_DIRECTORIES: import.meta.dirname,
    GIT_CONFIG_GLOBAL: path.join(cwd, 'global.gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
  };
});

afterEach(() => {
  rmSync(cwd, { force: true, recursive: true });
});

test('displays setup help', ({ execCli, expect }) => {
  const output = execCli('setup --help', { cwd });

  expect(execCli('setup -h', { cwd })).toBe(output);
  expect(normalizeHelpOutput(output)).toMatchSnapshot();
});

test('rejects unknown setup options', ({ execCli, expect }) => {
  expect(() => execCli('setup --unknown', { cwd })).toThrow();
});

test('reports missing and repeated hooks directory options', ({ expect }) => {
  const missing = runSetup(['--hooks-dir']);
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain('--hooks-dir');

  const repeated = runSetup(['--hooks-dir', 'first', '--hooks-dir', 'second']);
  expect(repeated.status).toBe(1);
  expect(repeated.stderr).toContain(
    'The --hooks-dir option cannot be specified more than once.',
  );
});

test('rejects invalid hooks directory options', ({ expect }) => {
  const empty = runSetup(['--hooks-dir', '']);
  expect(empty.status).toBe(1);
  expect(empty.stderr).toContain('Git hooks directory must not be empty.');

  const absolute = runSetup(['--hooks-dir', path.join(cwd, 'hooks')]);
  expect(absolute.status).toBe(1);
  expect(absolute.stderr).toContain(
    'Git hooks directory must be relative to the Git repository root.',
  );

  const parent = runSetup(['--hooks-dir', '../hooks']);
  expect(parent.status).toBe(1);
  expect(parent.stderr).toContain('Git hooks directory must not contain "..".');
});

test('installs hooks silently without loading Rstack config', ({
  execCli,
  expect,
}) => {
  initRepository();
  writeFileSync(
    path.join(cwd, 'rstack.config.ts'),
    'throw new Error("must not load");\n',
  );

  expect(execCli('setup', { cwd, env })).toBe('');
  expect(git(['config', '--local', '--get', 'core.hooksPath'])).toBe(hooksPath);
  expect(existsSync(path.join(cwd, hooksPath, 'runner'))).toBe(true);
  expect(existsSync(path.join(cwd, '.rstack', 'hooks', 'pre-commit'))).toBe(
    false,
  );

  expect(execCli('setup', { cwd, env })).toBe('');
});

test('guides and forces setup while preserving existing hooks', ({
  expect,
}) => {
  initRepository();
  const existingHook = path.join(cwd, '.git', 'hooks', 'pre-commit');
  writeFileSync(
    existingHook,
    "#!/usr/bin/env sh\nprintf 'ran\\n' > old-hook-ran\n",
  );
  chmodSync(existingHook, 0o755);

  const skippedOutput = runSetupSuccessfully([]);
  expect(skippedOutput).toContain(
    'Git hooks setup skipped: existing Git hooks were found: pre-commit.',
  );
  expect(skippedOutput).toContain(
    'To continue, run rs setup --force. Existing hook files will be preserved but become inactive.',
  );

  const forcedOutput = runSetupSuccessfully(['--force']);
  expect(forcedOutput).toContain(
    'info    Rstack now manages Git hooks at ".rstack/hooks/_".',
  );
  expect(forcedOutput).toContain(
    'Existing hooks in ".git/hooks" were preserved but will no longer run: pre-commit.',
  );
  expect(forcedOutput).toContain('Unset core.hooksPath to restore them.');
  expect(git(['config', '--local', '--get', 'core.hooksPath'])).toBe(hooksPath);

  git(['hook', 'run', 'pre-commit']);
  expect(existsSync(path.join(cwd, 'old-hook-ran'))).toBe(false);

  git(['config', '--local', '--unset', 'core.hooksPath']);
  git(['hook', 'run', 'pre-commit']);
  expect(existsSync(path.join(cwd, 'old-hook-ran'))).toBe(true);

  expect(runSetupSuccessfully(['-f'])).toContain(
    'Existing hooks in ".git/hooks" were preserved but will no longer run: pre-commit.',
  );
});

test('reports how to restore a replaced hooks path', ({ expect }) => {
  initRepository();
  const existingDirectory = path.join(cwd, '.husky', '_');
  mkdirSync(existingDirectory, { recursive: true });
  writeFileSync(
    path.join(existingDirectory, 'pre-commit'),
    '#!/usr/bin/env sh\n',
  );
  git(['config', '--local', 'core.hooksPath', '.husky/_']);

  const output = runSetupSuccessfully(['--force']);
  expect(output).toContain(
    'info    Rstack now manages Git hooks at ".rstack/hooks/_".',
  );
  expect(output).toContain(
    'Existing hooks in ".husky/_" were preserved but will no longer run: pre-commit.',
  );
  expect(output).toContain(
    'Set core.hooksPath back to ".husky/_" to restore them.',
  );
});

test('installs root-relative hooks and reports owner conflicts', ({
  execCli,
  expect,
}) => {
  initRepository();
  const frontend = path.join(cwd, 'frontend');
  const docs = path.join(cwd, 'docs');
  mkdirSync(frontend);
  mkdirSync(docs);

  expect(
    execCli('setup --hooks-dir "custom hooks"', { cwd: frontend, env }),
  ).toBe('');
  expect(git(['config', '--local', '--get', 'core.hooksPath'])).toBe(
    'custom hooks/_',
  );
  expect(existsSync(path.join(cwd, 'custom hooks', '_', 'runner'))).toBe(true);

  expect(runSetupSuccessfully(['--hooks-dir', 'custom hooks'], docs)).toContain(
    'Git hooks are already managed by Rstack project "frontend"',
  );
});

test('skips non-Git directories without creating files', ({
  execCli,
  expect,
}) => {
  expect(execCli('setup', { cwd, env })).toContain(
    'info    Git hooks setup skipped: not a Git repository.',
  );
  expect(existsSync(path.join(cwd, '.rstack'))).toBe(false);
});

test('skips setup when hooks are disabled', ({ execCli, expect }) => {
  const output = execCli('setup', { cwd, env: { ...env, RSTACK_HOOKS: '0' } });

  expect(output).toContain(
    'info    Git hooks setup skipped: disabled by RSTACK_HOOKS.',
  );
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
