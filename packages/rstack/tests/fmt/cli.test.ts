import { expect, test } from 'rstack/test';
import { fmtHelpMessage, parseFmtCLIArgs } from '../../src/fmt/cli.ts';

test('uses write mode by default', () => {
  expect(parseFmtCLIArgs([])).toEqual({
    mode: 'write',
    patterns: [],
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
    help: false,
  });
});

test('preserves file paths and globs', () => {
  const patterns = ['src/file with spaces.ts', 'src/**/*.{js,ts}', '!src/generated/**'];

  expect(parseFmtCLIArgs([patterns[0], '--check', ...patterns.slice(1)])).toEqual({
    mode: 'check',
    patterns,
    help: false,
  });
});

test('treats arguments after the terminator as paths', () => {
  expect(parseFmtCLIArgs(['--check', '--', '--write', '--help'])).toEqual({
    mode: 'check',
    patterns: ['--write', '--help'],
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

test.each(['--unknown', '--no-cache', '--no-parallel', '--parallel-workers'])(
  'rejects unsupported option %s',
  (option) => {
    expect(() => parseFmtCLIArgs([option])).toThrow();
  },
);
