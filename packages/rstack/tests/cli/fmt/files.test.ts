import { expect, test } from 'rstack/test';
import { normalizeHelpOutput } from '#test-helpers';
import {
  expectWriteSummary,
  normalizeDuration,
  setupFmtTest,
} from './helpers.ts';

const { readProjectFile, runCLI, runFmt, writeProjectFile } = setupFmtTest();

test('displays fmt help without loading config', () => {
  writeProjectFile('rstack.config.ts', 'throw new Error("must not load");\n');

  const fmt = runFmt(['--help']);

  expect(fmt.status).toBe(0);
  expect(normalizeHelpOutput(fmt.stdout)).toMatchSnapshot();
  expect(fmt.stderr).toBe('');
});

test('supports format as an alias for fmt', () => {
  writeProjectFile('index.ts', 'const message="hello"');

  const result = runCLI(['format', 'index.ts']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 1, 1);
  expect(result.stderr).toBe('');
  expect(readProjectFile('index.ts')).toBe('const message = "hello";\n');
});

test('returns exit code 2 for invalid arguments', () => {
  const result = runFmt(['--write', '--check']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(
    'The --write, --check, and --list-different options cannot be used together.',
  );
});

test('returns exit code 2 for unknown options', () => {
  const result = runFmt(['--bogus']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('--bogus');
});

test('formats the current directory with Prettier defaults', () => {
  writeProjectFile('index.ts', 'const message="hello"');

  const result = runFmt();

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 2, 1);
  expect(result.stderr).toBe('');
  expect(readProjectFile('index.ts')).toBe('const message = "hello";\n');
});

test('accepts -w as an alias for --write', () => {
  writeProjectFile('index.ts', 'const message="hello"');

  const result = runFmt(['-w', 'index.ts']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 1, 1);
  expect(result.stderr).toBe('');
  expect(readProjectFile('index.ts')).toBe('const message = "hello";\n');
});

test('formats files in node_modules with --with-node-modules', () => {
  const source = 'const message="hello"';
  writeProjectFile('node_modules/example/index.ts', source);

  const skipped = runFmt(['node_modules/example']);
  expect(skipped.status).toBe(2);
  expect(readProjectFile('node_modules/example/index.ts')).toBe(source);

  const result = runFmt(['--with-node-modules', 'node_modules/example']);
  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 1, 1);
  expect(result.stderr).toBe('');
  expect(readProjectFile('node_modules/example/index.ts')).toBe(
    'const message = "hello";\n',
  );
});

test('summarizes write mode when no files change', () => {
  writeProjectFile('index.ts', 'const message = "hello";\n');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 1, 0);
  expect(result.stderr).toBe('');
});

test('checks formatting without writing files', () => {
  const source = 'const message="hello"';
  writeProjectFile('index.ts', source);

  const result = runFmt(['--check', 'index.ts']);

  expect(result.status).toBe(1);
  expect(normalizeDuration(result.stdout)).toBe(
    'start   Checking formatting...\ninfo    Checked 1 file in <duration>.\n',
  );
  expect(result.stderr).toContain('error   index.ts');
  expect(normalizeDuration(result.stderr)).toContain(
    'error   Formatting issues found in 1 file. Run rs fmt to fix.',
  );
  expect(readProjectFile('index.ts')).toBe(source);

  writeProjectFile('index.ts', 'const message = "hello";\n');
  const formattedResult = runFmt(['--check', 'index.ts']);

  expect(formattedResult.status).toBe(0);
  expect(normalizeDuration(formattedResult.stdout)).toBe(
    'start   Checking formatting...\nsuccess Checked 1 file in <duration>. No issues found.\n',
  );
  expect(formattedResult.stderr).toBe('');
});

test.each(['-l', '--list-different'])(
  'lists only paths that differ with %s',
  (option) => {
    const source = 'const message="hello"';
    writeProjectFile('src/index.ts', source);
    writeProjectFile('src/formatted.ts', 'const formatted = true;\n');

    const result = runFmt([option, 'src/*.ts']);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('src/index.ts\n');
    expect(result.stderr).toBe('');
    expect(readProjectFile('src/index.ts')).toBe(source);
  },
);

test('returns exit code 2 for formatting errors', () => {
  writeProjectFile('index.ts', 'const value = ;');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('start   Formatting...\n');
  expect(result.stderr).toContain('error   index.ts: SyntaxError:');
});

test('reports partial writes when formatting fails', () => {
  writeProjectFile('valid.ts', 'const value=true');
  writeProjectFile('invalid.ts', 'const invalid = ;');

  const result = runFmt(['valid.ts', 'invalid.ts']);

  expect(result.status).toBe(2);
  expect(normalizeDuration(result.stdout)).toBe(
    'start   Formatting...\ninfo    Formatted 1 of 2 files in <duration>.\n',
  );
  expect(result.stderr).toContain('error   invalid.ts: SyntaxError:');
  expect(readProjectFile('valid.ts')).toBe('const value = true;\n');
  expect(readProjectFile('invalid.ts')).toBe('const invalid = ;');
});
