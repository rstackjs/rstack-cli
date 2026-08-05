import { stripVTControlCharacters } from 'node:util';
import { expect, test } from 'rstack/test';
import { fmtHelpMessage, parseFmtCLIArgs, prettyTime } from '../../src/fmt/cli.ts';

test.each([
  [0, '0.000s'],
  [0.009, '0.009s'],
  [0.01, '0.01s'],
  [9.876, '9.88s'],
  [10, '10.0s'],
  [59.9, '59.9s'],
  [60, '1m'],
  [61, '1m 1s'],
  [61.25, '1m 1.3s'],
  [125.25, '2m 5.3s'],
] as const)('formats %s seconds as %s', (seconds, expected) => {
  expect(stripVTControlCharacters(prettyTime(seconds))).toBe(expected);
});

test('uses write mode by default', () => {
  expect(parseFmtCLIArgs([])).toEqual({
    mode: 'write',
    patterns: [],
    ignorePaths: [],
    ignoreUnknown: false,
    noErrorOnUnmatchedPattern: false,
    withNodeModules: false,
    maxWorkers: undefined,
    help: false,
  });
});

test.each([
  ['-w', 'write'],
  ['--write', 'write'],
  ['--check', 'check'],
  ['--list-different', 'list-different'],
] as const)('parses %s mode', (option, mode) => {
  expect(parseFmtCLIArgs([option])).toEqual({
    mode,
    patterns: [],
    ignorePaths: [],
    ignoreUnknown: false,
    noErrorOnUnmatchedPattern: false,
    withNodeModules: false,
    maxWorkers: undefined,
    help: false,
  });
});

test('configures parallel worker count', () => {
  expect(parseFmtCLIArgs(['--parallel-workers', '3'])).toEqual({
    mode: 'write',
    patterns: [],
    ignorePaths: [],
    ignoreUnknown: false,
    noErrorOnUnmatchedPattern: false,
    withNodeModules: false,
    maxWorkers: 3,
    help: false,
  });
});

test.each(['0', '-1', '1.5', 'invalid', '9007199254740992'])(
  'rejects invalid parallel worker count %s',
  (count) => {
    expect(() => parseFmtCLIArgs([`--parallel-workers=${count}`])).toThrow(
      'The --parallel-workers option must be a positive integer.',
    );
  },
);

test('preserves file paths and globs', () => {
  const patterns = ['src/file with spaces.ts', 'src/**/*.{js,ts}', '!src/generated/**'];

  expect(parseFmtCLIArgs([patterns[0], '--check', ...patterns.slice(1)])).toEqual({
    mode: 'check',
    patterns,
    ignorePaths: [],
    ignoreUnknown: false,
    noErrorOnUnmatchedPattern: false,
    withNodeModules: false,
    maxWorkers: undefined,
    help: false,
  });
});

test('treats arguments after the terminator as paths', () => {
  expect(parseFmtCLIArgs(['--check', '--', '--write', '--help'])).toEqual({
    mode: 'check',
    patterns: ['--write', '--help'],
    ignorePaths: [],
    ignoreUnknown: false,
    noErrorOnUnmatchedPattern: false,
    withNodeModules: false,
    maxWorkers: undefined,
    help: false,
  });
});

test.each(['--help', '-h'])('parses %s', (option) => {
  expect(parseFmtCLIArgs([option]).help).toBe(true);
});

test('collects repeated ignore paths', () => {
  expect(
    parseFmtCLIArgs(['--ignore-path', '.prettierignore', '--ignore-path=config/format.ignore'])
      .ignorePaths,
  ).toEqual(['.prettierignore', 'config/format.ignore']);
});

test('parses --no-error-on-unmatched-pattern', () => {
  expect(parseFmtCLIArgs(['--no-error-on-unmatched-pattern']).noErrorOnUnmatchedPattern).toBe(true);
});

test.each(['-u', '--ignore-unknown', '--ignoreUnknown'])('parses %s', (option) => {
  expect(parseFmtCLIArgs([option]).ignoreUnknown).toBe(true);
});

test('parses --with-node-modules', () => {
  expect(parseFmtCLIArgs(['--with-node-modules']).withNodeModules).toBe(true);
});

test('parses --stdin-filepath', () => {
  expect(parseFmtCLIArgs(['--stdin-filepath', 'src/index.ts'])).toEqual({
    mode: 'write',
    patterns: [],
    ignorePaths: [],
    ignoreUnknown: false,
    noErrorOnUnmatchedPattern: false,
    withNodeModules: false,
    maxWorkers: undefined,
    help: false,
    stdinFilepath: 'src/index.ts',
  });
});

test('accepts a worker count with --stdin-filepath', () => {
  expect(parseFmtCLIArgs(['--stdin-filepath', 'index.ts', '--parallel-workers', '2'])).toEqual({
    mode: 'write',
    patterns: [],
    ignorePaths: [],
    ignoreUnknown: false,
    noErrorOnUnmatchedPattern: false,
    withNodeModules: false,
    maxWorkers: 2,
    help: false,
    stdinFilepath: 'index.ts',
  });
});

test.each(['--write', '--check', '--list-different'])(
  'rejects %s with --stdin-filepath',
  (option) => {
    expect(() => parseFmtCLIArgs(['--stdin-filepath', 'index.ts', option])).toThrow(
      'The --stdin-filepath option cannot be used with --write, --check, or --list-different.',
    );
  },
);

test('rejects file arguments with --stdin-filepath', () => {
  expect(() => parseFmtCLIArgs(['--stdin-filepath', 'index.ts', 'src/other.ts'])).toThrow(
    'The --stdin-filepath option cannot be used with file arguments.',
  );
});

test('provides command help', () => {
  const helpMessage = stripVTControlCharacters(fmtHelpMessage).replace(/^Rstack v.*\n\n/, '');

  expect(helpMessage).toContain('Usage:\n  $ rs fmt [options] [files/globs...]');
  expect(helpMessage).toMatchSnapshot();
});

test.each([
  ['--write', '--check'],
  ['--write', '--list-different'],
  ['--check', '--list-different'],
  ['--write', '--check', '--list-different'],
])('rejects conflicting modes: %s', (...args) => {
  expect(() => parseFmtCLIArgs(args)).toThrow(
    'The --write, --check, and --list-different options cannot be used together.',
  );
});

test.each(['--unknown', '--no-cache', '--no-parallel'])(
  'rejects unsupported option %s',
  (option) => {
    expect(() => parseFmtCLIArgs([option])).toThrow();
  },
);
