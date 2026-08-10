import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { installHooks } from '../../src/setup/install.ts';
import { runHook, withRepository, writeHook, writeInit } from './helpers.ts';

test('loads user init and project binaries', () => {
  withRepository((cwd) => {
    const projectDirectory = path.join(cwd, 'frontend');
    const binDirectory = path.join(projectDirectory, 'node_modules', '.bin');
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

    expect(installHooks({ cwd: projectDirectory }).status).toBe('installed');

    expect(runHook(cwd).status).toBe(0);
    expect(readFileSync(path.join(projectDirectory, 'init-ran'), 'utf8')).toBe('loaded\n');
    expect(readFileSync(path.join(projectDirectory, 'project-bin-ran'), 'utf8')).toBe('ran\n');
  });
});

test('skips user hooks when disabled by the environment or init', () => {
  withRepository((cwd) => {
    writeHook(cwd, 'echo ran >> hook-ran\n');
    expect(installHooks({ cwd }).status).toBe('installed');

    expect(runHook(cwd, '0').status).toBe(0);
    expect(existsSync(path.join(cwd, 'hook-ran'))).toBe(false);

    writeInit(cwd, 'set -u\nexport RSTACK_HOOKS=0\n');

    expect(runHook(cwd).status).toBe(0);
    expect(existsSync(path.join(cwd, 'hook-ran'))).toBe(false);
  });
});
