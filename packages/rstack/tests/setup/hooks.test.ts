import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { createHookFiles } from '../../src/setup/hooks.ts';

test('generates the dispatcher and all client-side Git hook shims', () => {
  const { runner, ...shims } = createHookFiles();

  expect(Object.keys(shims)).toEqual([
    'pre-commit',
    'pre-merge-commit',
    'prepare-commit-msg',
    'commit-msg',
    'post-commit',
    'applypatch-msg',
    'pre-applypatch',
    'post-applypatch',
    'pre-rebase',
    'post-rewrite',
    'post-checkout',
    'post-merge',
    'pre-push',
    'pre-auto-gc',
  ]);
  expect(runner).toBeTruthy();
  expect(new Set(Object.values(shims)).size).toBe(1);
});

test.runIf(process.platform !== 'win32')('runs generated hooks', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'rstack hooks '));
  const hooksDirectory = path.join(directory, 'hooks with spaces');
  const generatedDirectory = path.join(hooksDirectory, '_');
  const generatedHook = path.join(generatedDirectory, 'pre-commit');
  const userHook = path.join(hooksDirectory, 'pre-commit');
  const files = createHookFiles();

  try {
    mkdirSync(generatedDirectory, { recursive: true });
    writeFileSync(path.join(generatedDirectory, 'runner'), files.runner);
    writeFileSync(generatedHook, files['pre-commit']);

    expect(spawnSync('sh', [generatedHook]).status).toBe(0);

    writeFileSync(
      userHook,
      `read -r input
printf '%s\\n' "$1|$input"
exit 23
`,
    );
    const result = spawnSync('sh', [generatedHook, 'argument with spaces'], {
      encoding: 'utf8',
      input: 'standard input\n',
    });

    expect(result.status).toBe(23);
    expect(result.stdout).toBe('argument with spaces|standard input\n');

    writeFileSync(
      userHook,
      `false
printf 'unreachable\\n'
`,
    );
    const errexitResult = spawnSync('sh', [generatedHook], { encoding: 'utf8' });

    expect(errexitResult.status).toBe(1);
    expect(errexitResult.stdout).toBe('');
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
