import { spawnSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
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

test.runIf(process.platform === 'win32')('converts Windows Node paths', () => {
  const { runner } = createHookFiles(String.raw`C:\Program Files\nodejs\node.exe`);

  expect(runner).toContain("node_fallback='/c/Program Files/nodejs/node.exe'");
});

test.runIf(process.platform !== 'win32')('preserves backslashes in POSIX Node paths', () => {
  const nodeExecutable = String.raw`/opt/node\24/bin/node`;
  const { runner } = createHookFiles(nodeExecutable);

  expect(runner).toContain(`node_fallback='${nodeExecutable}'`);
});

test.runIf(process.platform !== 'win32')('runs generated hooks', () => {
  withDirectory((directory) => {
    const hooksDirectory = path.join(directory, "hooks with ' quotes");
    const generatedDirectory = path.join(hooksDirectory, '_');
    const generatedHook = path.join(generatedDirectory, 'pre-commit');
    const userHook = path.join(hooksDirectory, 'pre-commit');
    const fallbackNode = path.join(hooksDirectory, 'node');
    const configDirectory = path.join(directory, 'runtime config');
    const runtimeDirectory = path.join(configDirectory, 'rstack');
    const init = path.join(runtimeDirectory, 'hooks-init.sh');
    const files = createHookFiles(fallbackNode);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      XDG_CONFIG_HOME: configDirectory,
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

    mkdirSync(runtimeDirectory, { recursive: true });
    writeFileSync(init, `export PATH="${runtimeDirectory}"\n`);
    writeFileSync(userHook, 'command -v node\n');
    symlinkSync('/bin/sh', path.join(runtimeDirectory, 'sh'));
    symlinkSync('/bin/sh', fallbackNode);

    const fallbackResult = spawnSync('sh', [generatedHook], { encoding: 'utf8', env });
    expect(fallbackResult.stdout).toBe(`${fallbackNode}\n`);

    const activeNode = path.join(runtimeDirectory, 'node');
    symlinkSync('/bin/sh', activeNode);

    const activeResult = spawnSync('sh', [generatedHook], { encoding: 'utf8', env });
    expect(activeResult.stdout).toBe(`${activeNode}\n`);
  });
});
