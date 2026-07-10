import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from '#test-helpers';

const git = (cwd: string, args: string[]): void => {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
};

const createGitFixture = async (): Promise<string> => {
  const cwd = await mkdtemp(path.join(import.meta.dirname, 'fixture-'));

  await Promise.all([
    writeFile(
      path.join(cwd, 'rstack.config.ts'),
      `import { define } from 'rstack';

define.staged({ '*.txt': 'node revert.mjs' });
`,
    ),
    writeFile(
      path.join(cwd, 'revert.mjs'),
      `import { writeFileSync } from 'node:fs';

for (const file of process.argv.slice(2)) {
  writeFileSync(file, 'initial\\n');
}
`,
    ),
    writeFile(path.join(cwd, 'file.txt'), 'initial\n'),
  ]);

  git(cwd, ['init', '--quiet']);
  git(cwd, ['add', '.']);
  git(cwd, [
    '-c',
    'user.name=Rstack Test',
    '-c',
    'user.email=rstack@example.com',
    'commit',
    '--quiet',
    '-m',
    'initial',
  ]);

  await writeFile(path.join(cwd, 'file.txt'), 'changed\n');
  git(cwd, ['add', 'file.txt']);

  return cwd;
};

const withGitFixture = async (callback: (cwd: string) => Promise<void> | void): Promise<void> => {
  const cwd = await createGitFixture();

  try {
    await callback(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
};

test('should display the staged help message', ({ execCli, expect }) => {
  const output = execCli('staged --help');

  expect(output).toContain('Rstack v');
  expect(output).toContain('Usage:\n  $ rs staged [options]');
  expect(output).toContain('Runs lint-staged with tasks from define.staged in rstack.config.');
  expect(output).toContain('--allow-empty');
  expect(output).toContain('-h, --help');
});

test('should reject unknown staged options', ({ execCli, expect }) => {
  expect(() => execCli('staged --unknown')).toThrow();
});

test('should prevent an empty commit by default', async ({ execCli, expect }) => {
  await withGitFixture((cwd) => {
    expect(() => execCli('staged', { cwd })).toThrow();
  });
});

test('should allow an empty commit with --allow-empty', async ({ execCli }) => {
  await withGitFixture((cwd) => {
    execCli(`staged --allow-empty`, { cwd });
  });
});

test('should run staged tasks with --concurrent false', async ({ execCli }) => {
  await withGitFixture((cwd) => {
    execCli(`staged --allow-empty --concurrent false`, { cwd });
  });
});

test('should run staged tasks with -p 1', async ({ execCli }) => {
  await withGitFixture((cwd) => {
    execCli(`staged --allow-empty -p 1`, { cwd });
  });
});
