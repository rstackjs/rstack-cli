import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'rstack/test';
import { RSTACK_BIN_PATH } from '#test-helpers';

let projectPath: string;
let env: NodeJS.ProcessEnv;

const writeProjectFile = (filePath: string, content: string): void =>
  writeFileSync(path.join(projectPath, filePath), content);

const readProjectFile = (filePath: string): string =>
  readFileSync(path.join(projectPath, filePath), 'utf8');

const git = (args: string[]): string => {
  const result = spawnSync('git', args, {
    cwd: projectPath,
    encoding: 'utf8',
    env,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || `Git exited with status ${result.status}.`);
  }

  return result.stdout;
};

const runStaged = () =>
  spawnSync(process.execPath, [RSTACK_BIN_PATH, 'staged', '--no-stash'], {
    cwd: projectPath,
    encoding: 'utf8',
    env,
  });

beforeEach(() => {
  projectPath = mkdtempSync(path.join(import.meta.dirname, 'test-temp-staged-fmt-'));
  env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: path.join(projectPath, 'global.gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
  };

  git(['init', '--quiet']);
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({
  ignorePatterns: ['ignored-by-fmt.ts'],
});

define.staged({
  '*': 'rs fmt',
});
`,
  );
});

afterEach(() => {
  rmSync(projectPath, { force: true, recursive: true });
});

test('formats staged files with rs fmt and applies ignore rules', () => {
  writeProjectFile('.gitignore', 'ignored-by-git.ts\n');
  writeProjectFile('file with spaces.ts', 'const spaced="spaced"');
  writeProjectFile('ignored-by-git.ts', 'const gitIgnored="git ignored"');
  writeProjectFile('ignored-by-fmt.ts', 'const fmtIgnored="fmt ignored"');

  git(['add', '--', 'file with spaces.ts', 'ignored-by-fmt.ts']);
  git(['add', '--force', '--', 'ignored-by-git.ts']);

  const result = runStaged();

  expect(result.status).toBe(0);
  expect(readProjectFile('file with spaces.ts')).toBe('const spaced = "spaced";\n');
  expect(readProjectFile('ignored-by-git.ts')).toBe('const gitIgnored = "git ignored";\n');
  expect(readProjectFile('ignored-by-fmt.ts')).toBe('const fmtIgnored="fmt ignored"');
  expect(git(['show', ':file with spaces.ts'])).toBe('const spaced = "spaced";\n');
  expect(git(['show', ':ignored-by-git.ts'])).toBe('const gitIgnored = "git ignored";\n');
});

test('allows rs fmt when all staged files are ignored', () => {
  const source = 'const fmtIgnored="fmt ignored"';
  writeProjectFile('ignored-by-fmt.ts', source);
  git(['add', '--', 'ignored-by-fmt.ts']);

  const result = runStaged();

  expect(result.status).toBe(0);
  expect(readProjectFile('ignored-by-fmt.ts')).toBe(source);
  expect(git(['show', ':ignored-by-fmt.ts'])).toBe(source);
  expect(`${result.stdout}\n${result.stderr}`).not.toContain('No supported files matched');
});

test('still rejects staged files unsupported by rs fmt', () => {
  writeProjectFile('notes.unknown', 'plain text');
  git(['add', '--', 'notes.unknown']);

  const result = runStaged();

  expect(result.status).toBe(1);
  expect(`${result.stdout}\n${result.stderr}`).toContain('No supported files matched');
});

test('propagates rs fmt failures', () => {
  writeProjectFile('invalid.ts', 'const value = ;');
  git(['add', '--', 'invalid.ts']);

  const result = runStaged();

  expect(result.status).toBe(1);
  expect(`${result.stdout}\n${result.stderr}`).toContain('SyntaxError');
  expect(readProjectFile('invalid.ts')).toBe('const value = ;');
});
