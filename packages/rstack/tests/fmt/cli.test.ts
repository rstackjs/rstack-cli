import { expect, test } from 'rstack/test';
import { fmtHelpMessage, parseFmtCLIArgs } from '../../src/fmt/cli.ts';

test('uses write mode by default', () => {
  expect(parseFmtCLIArgs([])).toEqual({
    mode: 'write',
    patterns: [],
    parallel: true,
    maxWorkers: undefined,
    help: false,
  });
});

test.each([
  ['--write', 'write'],
  ['--check', 'check'],
  ['--list-different', 'list-different'],
  ['--listDifferent', 'list-different'],
] as const)('parses %s mode', (option, mode) => {
  expect(parseFmtCLIArgs([option])).toEqual({
    mode,
    patterns: [],
    parallel: true,
    maxWorkers: undefined,
    help: false,
  });
});

test.each(['--no-parallel', '--noParallel'])('disables parallel execution with %s', (option) => {
  expect(parseFmtCLIArgs([option])).toEqual({
    mode: 'write',
    patterns: [],
    parallel: false,
    maxWorkers: undefined,
    help: false,
  });
});

test.each(['--parallel-workers', '--parallelWorkers'])(
  'configures parallel worker count with %s',
  (option) => {
    expect(parseFmtCLIArgs([option, '3'])).toEqual({
      mode: 'write',
      patterns: [],
      parallel: true,
      maxWorkers: 3,
      help: false,
    });
  },
);

test.each(['0', '-1', '1.5', 'invalid', '9007199254740992'])(
  'rejects invalid parallel worker count %s',
  (count) => {
    expect(() => parseFmtCLIArgs([`--parallel-workers=${count}`])).toThrow(
      'The --parallel-workers option must be a positive integer.',
    );
  },
);

test('prefers the kebab-case parallel worker option', () => {
  expect(parseFmtCLIArgs(['--parallel-workers', '2', '--parallelWorkers', '3']).maxWorkers).toBe(2);
});

test.each([
  ['--no-parallel', '--parallel-workers'],
  ['--noParallel', '--parallelWorkers'],
])('rejects conflicting parallel options: %s and %s', (noParallel, maxWorkersOption) => {
  expect(() => parseFmtCLIArgs([noParallel, maxWorkersOption, '2'])).toThrow(
    'The --parallel-workers and --no-parallel options cannot be used together.',
  );
});

test('preserves file paths and globs', () => {
  const patterns = ['src/file with spaces.ts', 'src/**/*.{js,ts}', '!src/generated/**'];

  expect(parseFmtCLIArgs([patterns[0], '--check', ...patterns.slice(1)])).toEqual({
    mode: 'check',
    patterns,
    parallel: true,
    maxWorkers: undefined,
    help: false,
  });
});

test('treats arguments after the terminator as paths', () => {
  expect(parseFmtCLIArgs(['--check', '--', '--write', '--help'])).toEqual({
    mode: 'check',
    patterns: ['--write', '--help'],
    parallel: true,
    maxWorkers: undefined,
    help: false,
  });
});

test.each(['--help', '-h'])('parses %s', (option) => {
  expect(parseFmtCLIArgs([option]).help).toBe(true);
});

test('provides command help', () => {
  expect(fmtHelpMessage).toContain('Usage:\n  $ rs fmt [options] [files/globs...]');
  expect(fmtHelpMessage).toContain('--write');
  expect(fmtHelpMessage).toContain('--check');
  expect(fmtHelpMessage).toContain('--list-different');
  expect(fmtHelpMessage).toContain('--no-parallel');
  expect(fmtHelpMessage).toContain('--parallel-workers <count>');
  expect(fmtHelpMessage).toContain('-h, --help');
});

test.each([
  ['--write', '--check'],
  ['--write', '--list-different'],
  ['--write', '--listDifferent'],
  ['--check', '--list-different'],
  ['--write', '--check', '--list-different'],
])('rejects conflicting modes: %s', (...args) => {
  expect(() => parseFmtCLIArgs(args)).toThrow(
    'The --write, --check, and --list-different options cannot be used together.',
  );
});

test.each(['--unknown', '--no-cache'])('rejects unsupported option %s', (option) => {
  expect(() => parseFmtCLIArgs([option])).toThrow();
});
