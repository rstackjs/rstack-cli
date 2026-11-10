import { expect, test } from 'rstack/test';
import { normalizeDuration, setupFmtTest } from './helpers.ts';

const { projectFileExists, runFmt, writeProjectFile } = setupFmtTest();

test('returns exit code 2 when no files match', () => {
  for (const modeArgs of [[], ['--check'], ['--list-different']]) {
    const result = runFmt([...modeArgs, 'missing/**/*.ts']);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'No supported files matched "missing/**/*.ts", or all matching files were ignored.',
    );
    expect(result.stderr).not.toContain('\n    at ');
  }
  expect(projectFileExists('.rstack')).toBe(false);
});

test('allows no files to match with --no-error-on-unmatched-pattern', () => {
  for (const modeArgs of [[], ['--check'], ['--list-different']]) {
    const result = runFmt([
      ...modeArgs,
      '--no-error-on-unmatched-pattern',
      'missing/**/*.ts',
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  }
});

test('counts only supported files', () => {
  writeProjectFile('index.ts', 'const value = 1;\n');
  writeProjectFile('other.ts', 'const other = 2;\n');
  writeProjectFile('notes.unknown', 'plain text');

  const result = runFmt(['--check', 'index.ts', 'other.ts', 'notes.unknown']);

  expect(result.status).toBe(0);
  expect(normalizeDuration(result.stdout)).toBe(
    'start   Checking formatting...\nsuccess Format check passed in <duration> (2 files)\n',
  );
  expect(result.stderr).toBe('');
});

test('returns exit code 2 when all matched files are unsupported', () => {
  writeProjectFile('notes.unknown', 'plain text');

  for (const modeArgs of [[], ['--check'], ['--list-different']]) {
    const result = runFmt([...modeArgs, 'notes.unknown']);

    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain('success');
    expect(result.stderr).toContain(
      'No supported files matched "notes.unknown", or all matching files were ignored.',
    );
    expect(result.stderr).not.toContain('\n    at ');
  }
});

test('ignores unsupported files with --ignore-unknown', () => {
  writeProjectFile('notes.unknown', 'plain text');

  for (const modeArgs of [[], ['--check'], ['--list-different']]) {
    const result = runFmt([...modeArgs, '--ignore-unknown', 'notes.unknown']);

    expect(result.status).toBe(0);
    const expectedStdout = modeArgs.includes('--check')
      ? 'start   Checking formatting...\nsuccess No supported files to check.\n'
      : modeArgs.includes('--list-different')
        ? ''
        : 'start   Formatting...\nsuccess No supported files to format.\n';
    expect(result.stdout).toBe(expectedStdout);
    expect(result.stderr).toBe('');
  }
});

test('supports -u as an alias for --ignore-unknown', () => {
  writeProjectFile('notes.unknown', 'plain text');

  const result = runFmt(['-u', 'notes.unknown']);

  expect(result.status).toBe(0);
  expect(result.stdout).toBe(
    'start   Formatting...\nsuccess No supported files to format.\n',
  );
  expect(result.stderr).toBe('');
});

test('does not treat unmatched patterns as unknown files', () => {
  const result = runFmt(['--ignore-unknown', 'missing/**/*.unknown']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(
    'No supported files matched "missing/**/*.unknown"',
  );
});

test('does not treat unsupported files as unmatched patterns', () => {
  writeProjectFile('notes.unknown', 'plain text');

  const result = runFmt(['--no-error-on-unmatched-pattern', 'notes.unknown']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('start   Formatting...\n');
  expect(result.stderr).toContain('No supported files matched "notes.unknown"');
});
