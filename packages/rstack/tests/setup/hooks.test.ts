import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { createHookFiles } from '../../src/setup/hooks.ts';
import { withDirectory } from './helpers.ts';

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
  withDirectory((directory) => {
    const hooksDirectory = path.join(directory, 'hooks with spaces');
    const generatedDirectory = path.join(hooksDirectory, '_');
    const generatedHook = path.join(generatedDirectory, 'pre-commit');
    const userHook = path.join(hooksDirectory, 'pre-commit');
    const files = createHookFiles();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      XDG_CONFIG_HOME: path.join(directory, 'config'),
    };

    mkdirSync(generatedDirectory, { recursive: true });
    writeFileSync(path.join(generatedDirectory, 'runner'), files.runner);
    writeFileSync(generatedHook, files['pre-commit']);

    expect(spawnSync('sh', [generatedHook], { env }).status).toBe(0);

    writeFileSync(
      userHook,
      `read -r input
printf '%s\\n' "$1|$input"
`,
    );
    const result = spawnSync('sh', [generatedHook, 'argument with spaces'], {
      encoding: 'utf8',
      env,
      input: 'standard input\n',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('argument with spaces|standard input\n');

    writeFileSync(
      userHook,
      `false
printf 'unreachable\\n'
`,
    );
    const errexitResult = spawnSync('sh', [generatedHook], { encoding: 'utf8', env });

    expect(errexitResult.status).toBe(1);
    expect(errexitResult.stdout).toBe('Rstack - pre-commit hook failed (code 1)\n');
  });
});
