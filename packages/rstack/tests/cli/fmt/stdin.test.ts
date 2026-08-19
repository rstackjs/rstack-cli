import { expect, test } from 'rstack/test';
import {
  packageJsonSource,
  setupFmtTest,
  sortedPackageJson,
} from './helpers.ts';

const { projectFileExists, runFmtStdin, writeProjectFile } = setupFmtTest();

test('formats stdin for the given filepath', () => {
  const result = runFmtStdin(
    ['--stdin-filepath', 'src/index.ts'],
    'const message="hello"',
  );

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('const message = "hello";\n');
  expect(result.stderr).toBe('');
  expect(projectFileExists('.rstack')).toBe(false);
});

test('applies define.fmt options and overrides to stdin', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({
  singleQuote: true,
  overrides: [
    {
      files: '*.test.ts',
      options: {
        semi: false,
      },
    },
  ],
});
`,
  );

  const result = runFmtStdin(
    ['--stdin-filepath', 'src/index.test.ts'],
    'const test="test"',
  );

  expect(result.status).toBe(0);
  expect(result.stdout).toBe("const test = 'test'\n");
  expect(result.stderr).toBe('');
});

test('sorts package.json from stdin', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({ sortPackageJson: true });
`,
  );

  const result = runFmtStdin(
    ['--stdin-filepath', 'package.json'],
    packageJsonSource,
  );

  expect(result.status).toBe(0);
  expect(result.stdout).toBe(sortedPackageJson);
  expect(result.stderr).toBe('');
});

test('echoes ignored stdin paths verbatim', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({ ignorePatterns: ['src/ignored.ts'] });
`,
  );

  const source = 'const ignored="ignored"';
  const result = runFmtStdin(['--stdin-filepath', 'src/ignored.ts'], source);

  expect(result.status).toBe(0);
  expect(result.stdout).toBe(source);
  expect(result.stderr).toBe('');
});

test('echoes stdin paths ignored by --ignore-path', () => {
  writeProjectFile('.prettierignore', 'src/ignored.ts\n');

  const source = 'const ignored="ignored"';
  const result = runFmtStdin(
    ['--ignore-path', '.prettierignore', '--stdin-filepath', 'src/ignored.ts'],
    source,
  );

  expect(result.status).toBe(0);
  expect(result.stdout).toBe(source);
  expect(result.stderr).toBe('');
});

test('echoes stdin for default ignored lock files', () => {
  const source = 'lockfileVersion:   "9.0"\n';
  const result = runFmtStdin(['--stdin-filepath', 'pnpm-lock.yaml'], source);

  expect(result.status).toBe(0);
  expect(result.stdout).toBe(source);
  expect(result.stderr).toBe('');
});

test('returns exit code 2 when no parser can be inferred for stdin', () => {
  const result = runFmtStdin(['--stdin-filepath', 'data.unknown'], 'value');

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(
    'No parser could be inferred for "data.unknown".',
  );
});

test('ignores stdin when no parser can be inferred with --ignore-unknown', () => {
  const result = runFmtStdin(
    ['--stdin-filepath', 'data.unknown', '--ignore-unknown'],
    'value',
  );

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('');
});

test('returns exit code 2 for stdin parse errors', () => {
  const result = runFmtStdin(
    ['--stdin-filepath', 'index.ts'],
    'const value = ;',
  );

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain("Unexpected token ';'");
});

test.each(['--write', '--check', '--list-different'])(
  'returns exit code 2 for %s with --stdin-filepath',
  (option) => {
    const result = runFmtStdin(
      ['--stdin-filepath', 'index.ts', option],
      'const value=1',
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'The --stdin-filepath option cannot be used with --write, --check, or --list-different.',
    );
  },
);

test('returns exit code 2 for file arguments with --stdin-filepath', () => {
  const result = runFmtStdin(
    ['--stdin-filepath', 'index.ts', 'src/other.ts'],
    'const value=1',
  );

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(
    'The --stdin-filepath option cannot be used with file arguments.',
  );
});

test('accepts --parallel-workers with --stdin-filepath', () => {
  const result = runFmtStdin(
    ['--stdin-filepath', 'index.ts', '--parallel-workers', '2'],
    'const value=1',
  );

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('const value = 1;\n');
  expect(result.stderr).toBe('');
});

test('writes nothing for empty stdin', () => {
  const result = runFmtStdin(['--stdin-filepath', 'index.ts'], '');

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('');
});
