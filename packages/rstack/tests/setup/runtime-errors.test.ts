import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { installHooks } from '../../src/setup/install.ts';
import { runHook, withRepository, writeHook } from './helpers.ts';

test('traces and reports hook failures and command lookup errors', () => {
  withRepository((cwd) => {
    writeHook(cwd, 'exit 23\n');
    expect(installHooks({ cwd }).status).toBe('installed');

    const failed = runHook(cwd, '2');
    expect(failed.status).toBe(23);
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
    const missing = runHook(cwd);
    const actualPath = readFileSync(path.join(cwd, 'hook-path'), 'utf8').trim();
    const output = `${missing.stdout}${missing.stderr}`;

    expect(missing.status).toBe(127);
    expect(output).toContain('Rstack - pre-commit hook failed (code 127)');
    expect(output).toContain(`Rstack - command not found in PATH=${actualPath}`);
  });
});
