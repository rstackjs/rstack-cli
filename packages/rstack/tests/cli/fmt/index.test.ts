import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'rstack/test';
import { RSTACK_BIN_PATH } from '#test-helpers';

let projectPath: string;
const packageJsonSource =
  '{"dependencies":{"z":"1.0.0","a":"1.0.0"},"type":"module","version":"1.0.0","name":"fixture"}';
const sortedPackageJson =
  '{\n  "name": "fixture",\n  "version": "1.0.0",\n  "type": "module",\n  "dependencies": {\n    "a": "1.0.0",\n    "z": "1.0.0"\n  }\n}\n';

const writeProjectFile = (filePath: string, content: string): void => {
  const absolutePath = path.join(projectPath, filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
};

const readProjectFile = (filePath: string): string =>
  readFileSync(path.join(projectPath, filePath), 'utf8');

const writeFixturePlugin = (): void => {
  writeProjectFile(
    'node_modules/prettier-plugin-fixture/package.json',
    JSON.stringify({ name: 'prettier-plugin-fixture', exports: './index.mjs' }),
  );
  writeProjectFile(
    'node_modules/prettier-plugin-fixture/index.mjs',
    `export default {
  languages: [{ name: 'Fixture JSON', parsers: ['json'], extensions: ['.fixture'] }],
};
`,
  );
};

const runCLI = (args: string[], input?: string, cwd = projectPath) => {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
  delete env.FORCE_COLOR;

  return spawnSync(process.execPath, [RSTACK_BIN_PATH, ...args], {
    cwd,
    encoding: 'utf8',
    env,
    input,
  });
};

const runFmt = (args: string[] = [], cwd = projectPath) => runCLI(['fmt', ...args], undefined, cwd);

const runFmtStdin = (args: string[], input: string) => runCLI(['fmt', ...args], input);

const normalizeDuration = (output: string): string =>
  output.replace(/\d+m(?: \d+(?:\.\d+)?s)?|\d+(?:\.\d+)?s/g, '<duration>');

const expectWriteSummary = (
  output: string,
  matchedFileCount: number,
  writtenCount: number,
): void => {
  const files = matchedFileCount === 1 ? 'file' : 'files';
  const message = writtenCount
    ? `Formatted ${writtenCount} of ${matchedFileCount} ${files} in <duration>.`
    : `Checked ${matchedFileCount} ${files} in <duration>. No changes needed.`;
  expect(normalizeDuration(output)).toBe(`success ${message}\n`);
};

beforeEach(() => {
  projectPath = mkdtempSync(path.join(import.meta.dirname, 'test-temp-fmt-'));
  // Prevent repository-level ignore rules from affecting the fixture.
  mkdirSync(path.join(projectPath, '.git'));
  writeProjectFile('rstack.config.ts', 'export {};\n');
});

afterEach(() => {
  rmSync(projectPath, { force: true, recursive: true });
});

test('displays fmt help without loading config', () => {
  writeProjectFile('rstack.config.ts', 'throw new Error("must not load");\n');

  const topLevel = runCLI(['--help']);
  const fmt = runFmt(['--help']);

  expect(topLevel.status).toBe(0);
  expect(topLevel.stdout).toContain('fmt, format  Format code');
  expect(fmt.status).toBe(0);
  expect(fmt.stdout).toContain('Usage:\n  $ rs fmt [options] [files/globs...]');
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
  expect(readProjectFile('node_modules/example/index.ts')).toBe('const message = "hello";\n');
});

test('summarizes write mode when no files change', () => {
  writeProjectFile('index.ts', 'const message = "hello";\n');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 1, 0);
  expect(result.stderr).toBe('');
});

test.each([
  ['write', []],
  ['check', ['--check']],
  ['list-different', ['--list-different']],
] as const)('uses the default cache in %s mode', (_, args) => {
  writeProjectFile('index.ts', 'const value = 1;\n');
  writeProjectFile('.rstack/cache/fmt-v1.json', 'legacy');

  const result = runFmt([...args, 'index.ts']);

  expect(result.status).toBe(0);
  expect(readProjectFile('.rstack/cache/.gitignore')).toBe('*\n');
  expect(JSON.parse(readProjectFile('.rstack/cache/fmt/v1.json'))).toMatchObject({
    version: 1,
    files: {
      'index.ts': [expect.any(String), expect.any(String), 'clean'],
    },
  });
  expect(readProjectFile('.rstack/cache/fmt-v1.json')).toBe('legacy');
});

test('--no-cache bypasses cache reads and writes', () => {
  writeProjectFile('index.ts', 'const value=1');
  writeProjectFile('custom-cache/v1.json', '{"value":true}');

  const first = runFmt([
    '--no-cache',
    '--cache-location',
    'custom-cache',
    'index.ts',
    'custom-cache/v1.json',
  ]);

  expect(first.status).toBe(0);
  expect(readProjectFile('custom-cache/v1.json')).toBe('{ "value": true }\n');
  expect(existsSync(path.join(projectPath, '.rstack'))).toBe(false);

  writeProjectFile('.rstack/cache/fmt-v1.json', 'stale');
  writeProjectFile('index.ts', 'const value=2');
  const second = runFmt(['--no-cache', 'index.ts']);

  expect(second.status).toBe(0);
  expect(readProjectFile('index.ts')).toBe('const value = 2;\n');
  expect(readProjectFile('.rstack/cache/fmt-v1.json')).toBe('stale');
  expect(existsSync(path.join(projectPath, '.rstack/cache/.gitignore'))).toBe(false);
});

test.each(['relative', 'absolute'] as const)('uses a %s custom cache location', (kind) => {
  const cacheDir = path.join(projectPath, 'custom-cache');
  const cacheLocation = kind === 'relative' ? path.relative(projectPath, cacheDir) : cacheDir;
  const cachePath = path.join(cacheDir, 'v1.json');
  writeProjectFile('index.ts', 'const value = 1;\n');

  const result = runFmt(['--cache-location', cacheLocation, 'index.ts']);

  expect(result.status).toBe(0);
  expect(JSON.parse(readFileSync(cachePath, 'utf8'))).toMatchObject({
    version: 1,
    files: {
      'index.ts': [expect.any(String), expect.any(String), 'clean'],
    },
  });
  expect(existsSync(path.join(projectPath, 'custom-cache/.gitignore'))).toBe(false);
  expect(existsSync(path.join(projectPath, '.rstack'))).toBe(false);
});

test.each(['.', '..'])('rejects a custom cache location at %s', (cacheLocation) => {
  const result = runFmt(['--cache-location', cacheLocation, '.']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(
    'The --cache-location directory cannot be the current working directory or an ancestor.',
  );
});

test('excludes the custom cache directory from formatting', () => {
  const cacheLocation = 'custom-cache';
  writeProjectFile('index.ts', 'const value = 1;\n');
  writeProjectFile('custom-cache/nested/ignored.ts', 'const value=2');
  expect(runFmt(['--cache-location', cacheLocation, 'index.ts']).status).toBe(0);

  const result = runFmt(['--cache-location', cacheLocation, '.']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 2, 0);
  expect(readProjectFile('custom-cache/nested/ignored.ts')).toBe('const value=2');
});

test('uses an explicit config root cache from a subdirectory', () => {
  const appPath = path.join(projectPath, 'packages/app');
  writeProjectFile('packages/app/index.ts', 'const value=1');

  const result = runFmt(['index.ts', '--config', '../../rstack.config.ts'], appPath);

  expect(result.status).toBe(0);
  expect(readProjectFile('packages/app/index.ts')).toBe('const value = 1;\n');
  expect(existsSync(path.join(projectPath, '.rstack/cache/fmt/v1.json'))).toBe(true);
  expect(existsSync(path.join(appPath, '.rstack'))).toBe(false);
  expect(JSON.parse(readProjectFile('.rstack/cache/fmt/v1.json'))).toMatchObject({
    files: {
      'packages/app/index.ts': [expect.any(String), expect.any(String), 'clean'],
    },
  });
});

test('recovers from a corrupted cache', () => {
  writeProjectFile('index.ts', 'const value = 1;\n');
  const first = runFmt(['--check', 'index.ts']);
  writeProjectFile('.rstack/cache/fmt/v1.json', '{');

  const second = runFmt(['--check', 'index.ts']);

  expect(second.status).toBe(0);
  expect(normalizeDuration(second.stdout)).toBe(normalizeDuration(first.stdout));
  expect(second.stderr).toBe(first.stderr);
  expect(JSON.parse(readProjectFile('.rstack/cache/fmt/v1.json'))).toMatchObject({ version: 1 });
});

test('formats without a writable cache directory', () => {
  writeProjectFile('.rstack', 'not a directory');
  writeProjectFile('index.ts', 'const value=1');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(0);
  expect(readProjectFile('index.ts')).toBe('const value = 1;\n');
});

test('does not sort package.json by default', () => {
  writeProjectFile('package.json', packageJsonSource);

  const result = runFmt(['package.json']);

  expect(result.status).toBe(0);
  expect(readProjectFile('package.json')).toContain(
    '"dependencies": {\n    "z": "1.0.0",\n    "a": "1.0.0"',
  );
});

test('sorts package.json with workers', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({ sortPackageJson: true });
`,
  );
  writeProjectFile('package.json', packageJsonSource);
  writeProjectFile('packages/example/package.json', packageJsonSource);

  const result = runFmt(['package.json', 'packages/example/package.json']);

  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(readProjectFile('package.json')).toBe(sortedPackageJson);
  expect(readProjectFile('packages/example/package.json')).toBe(sortedPackageJson);
});

test('supports configuring the worker count', () => {
  writeProjectFile('first.ts', 'const first="first"');
  writeProjectFile('second.ts', 'const second="second"');

  const result = runFmt(['--parallel-workers', '1', 'first.ts', 'second.ts']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 2, 2);
  expect(result.stderr).toBe('');
  expect(readProjectFile('first.ts')).toBe('const first = "first";\n');
  expect(readProjectFile('second.ts')).toBe('const second = "second";\n');
});

test('does not load Prettier config or ignore files', () => {
  writeProjectFile('.prettierrc.json', '{ "singleQuote": true, "semi": false }\n');
  writeProjectFile('.prettierignore', 'index.ts\n');
  writeProjectFile('.editorconfig', 'root = true\n\n[*]\nindent_style = space\nindent_size = 8\n');
  writeProjectFile('index.ts', "function getMessage(){\n        return 'hello'\n}");

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 1, 1);
  expect(result.stderr).toBe('');
  expect(readProjectFile('index.ts')).toBe('function getMessage() {\n  return "hello";\n}\n');
});

test('applies repeated ignore paths', () => {
  writeProjectFile('.prettierignore', 'src/ignored-by-root.ts\n');
  writeProjectFile('config/extra.ignore', '../src/ignored-by-extra.ts\n');
  writeProjectFile('src/ignored-by-root.ts', 'const root="ignored"');
  writeProjectFile('src/ignored-by-extra.ts', 'const extra="ignored"');
  writeProjectFile('src/index.ts', 'const index="formatted"');

  const result = runFmt([
    '--ignore-path',
    '.prettierignore',
    '--ignore-path=config/extra.ignore',
    'src/ignored-by-root.ts',
    'src/ignored-by-extra.ts',
    'src/index.ts',
  ]);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 1, 1);
  expect(result.stderr).toBe('');
  expect(readProjectFile('src/ignored-by-root.ts')).toBe('const root="ignored"');
  expect(readProjectFile('src/ignored-by-extra.ts')).toBe('const extra="ignored"');
  expect(readProjectFile('src/index.ts')).toBe('const index = "formatted";\n');
});

test('returns exit code 2 for an unreadable ignore path', () => {
  writeProjectFile('index.ts', 'const value=true');

  const result = runFmt(['--ignore-path', 'missing.ignore', 'index.ts']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('Failed to read ignore file "missing.ignore".');
  expect(readProjectFile('index.ts')).toBe('const value=true');
});

test('applies define.fmt options, overrides, ignore patterns, and globs', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({
  singleQuote: true,
  ignorePatterns: ['src/ignored.ts'],
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
  writeProjectFile('src/index.ts', 'const message="hello"');
  writeProjectFile('src/index.test.ts', 'const test="test"');
  writeProjectFile('src/ignored.ts', 'const ignored="ignored"');
  writeProjectFile('src/index.js', 'const javascript="untouched"');

  const result = runFmt(['--write', 'src/**/*.ts']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 2, 2);
  expect(result.stderr).toBe('');
  expect(readProjectFile('src/index.ts')).toBe("const message = 'hello';\n");
  expect(readProjectFile('src/index.test.ts')).toBe("const test = 'test'\n");
  expect(readProjectFile('src/ignored.ts')).toBe('const ignored="ignored"');
  expect(readProjectFile('src/index.js')).toBe('const javascript="untouched"');
});

test('uses an explicit Rstack config', () => {
  writeProjectFile(
    'custom.config.ts',
    `import { define } from 'rstack';

define.fmt({
  singleQuote: true,
});
`,
  );
  writeProjectFile('index.ts', 'const message="hello"');

  const result = runFmt(['index.ts', '--config', 'custom.config.ts']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 1, 1);
  expect(result.stderr).toBe('');
  expect(readProjectFile('index.ts')).toBe("const message = 'hello';\n");
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
    'error   Formatting issues found in 1 file. Run without --check to fix.',
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

test.each(['-l', '--list-different'])('lists only paths that differ with %s', (option) => {
  const source = 'const message="hello"';
  writeProjectFile('src/index.ts', source);
  writeProjectFile('src/formatted.ts', 'const formatted = true;\n');

  const result = runFmt([option, 'src/*.ts']);

  expect(result.status).toBe(1);
  expect(result.stdout).toBe('src/index.ts\n');
  expect(result.stderr).toBe('');
  expect(readProjectFile('src/index.ts')).toBe(source);
});

test('returns exit code 2 for config errors', () => {
  writeProjectFile('rstack.config.ts', 'throw new Error("invalid fmt config");\n');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('invalid fmt config');
});

test('formats with a project-local plugin in workers', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({
  plugins: ['prettier-plugin-fixture'],
});
`,
  );
  writeFixturePlugin();
  writeProjectFile('first.fixture', '{"first":true}');
  writeProjectFile('second.fixture', '{"second":true}');

  const result = runFmt(['*.fixture']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 2, 2);
  expect(result.stderr).toBe('');
  expect(readProjectFile('first.fixture')).toBe('{ "first": true }\n');
  expect(readProjectFile('second.fixture')).toBe('{ "second": true }\n');
});

test('formats mixed plugin overrides in workers', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({
  overrides: [
    {
      files: '*.fixture',
      options: { plugins: ['prettier-plugin-fixture'] },
    },
  ],
});
`,
  );
  writeFixturePlugin();
  writeProjectFile('data.fixture', '{"value":true}');
  writeProjectFile('index.ts', 'const value=true');

  const result = runFmt(['data.fixture', 'index.ts']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 2, 2);
  expect(result.stderr).toBe('');
  expect(readProjectFile('data.fixture')).toBe('{ "value": true }\n');
  expect(readProjectFile('index.ts')).toBe('const value = true;\n');
});

test('returns exit code 2 for imported plugin objects', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({
  plugins: [{ languages: [] }],
});
`,
  );
  writeProjectFile('index.ts', 'const value=true');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(
    'Prettier plugin objects are not supported. Use a package name, path, or URL instead.',
  );
});

test('returns exit code 2 for formatting errors', () => {
  writeProjectFile('index.ts', 'const value = ;');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('error   index.ts: SyntaxError:');
});

test('reports partial writes when formatting fails', () => {
  writeProjectFile('valid.ts', 'const value=true');
  writeProjectFile('invalid.ts', 'const invalid = ;');

  const result = runFmt(['valid.ts', 'invalid.ts']);

  expect(result.status).toBe(2);
  expect(normalizeDuration(result.stdout)).toBe('info    Formatted 1 of 2 files in <duration>.\n');
  expect(result.stderr).toContain('error   invalid.ts: SyntaxError:');
  expect(readProjectFile('valid.ts')).toBe('const value = true;\n');
  expect(readProjectFile('invalid.ts')).toBe('const invalid = ;');
});

test('formats stdin for the given filepath', () => {
  const result = runFmtStdin(['--stdin-filepath', 'src/index.ts'], 'const message="hello"');

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('const message = "hello";\n');
  expect(result.stderr).toBe('');
  expect(existsSync(path.join(projectPath, '.rstack'))).toBe(false);
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

  const result = runFmtStdin(['--stdin-filepath', 'src/index.test.ts'], 'const test="test"');

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

  const result = runFmtStdin(['--stdin-filepath', 'package.json'], packageJsonSource);

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
  expect(result.stderr).toContain('No parser could be inferred for "data.unknown".');
});

test('ignores stdin when no parser can be inferred with --ignore-unknown', () => {
  const result = runFmtStdin(['--stdin-filepath', 'data.unknown', '--ignore-unknown'], 'value');

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('');
});

test('returns exit code 2 for stdin parse errors', () => {
  const result = runFmtStdin(['--stdin-filepath', 'index.ts'], 'const value = ;');

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain("Unexpected token ';'");
});

test.each(['--write', '--check', '--list-different'])(
  'returns exit code 2 for %s with --stdin-filepath',
  (option) => {
    const result = runFmtStdin(['--stdin-filepath', 'index.ts', option], 'const value=1');

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'The --stdin-filepath option cannot be used with --write, --check, or --list-different.',
    );
  },
);

test('returns exit code 2 for file arguments with --stdin-filepath', () => {
  const result = runFmtStdin(['--stdin-filepath', 'index.ts', 'src/other.ts'], 'const value=1');

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
  expect(existsSync(path.join(projectPath, '.rstack'))).toBe(false);
});

test('allows no files to match with --no-error-on-unmatched-pattern', () => {
  for (const modeArgs of [[], ['--check'], ['--list-different']]) {
    const result = runFmt([...modeArgs, '--no-error-on-unmatched-pattern', 'missing/**/*.ts']);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  }
});

test('counts only supported files', () => {
  writeProjectFile('index.ts', 'const value = 1;\n');
  writeProjectFile('notes.unknown', 'plain text');

  const result = runFmt(['--check', 'index.ts', 'notes.unknown']);

  expect(result.status).toBe(0);
  expect(normalizeDuration(result.stdout)).toBe(
    'start   Checking formatting...\nsuccess Checked 1 file in <duration>. No issues found.\n',
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
    expect(result.stdout).toBe(
      modeArgs.includes('--check')
        ? 'start   Checking formatting...\nsuccess No supported files to check.\n'
        : '',
    );
    expect(result.stderr).toBe('');
  }
});

test('supports -u as an alias for --ignore-unknown', () => {
  writeProjectFile('notes.unknown', 'plain text');

  const result = runFmt(['-u', 'notes.unknown']);

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('');
});

test('does not treat unmatched patterns as unknown files', () => {
  const result = runFmt(['--ignore-unknown', 'missing/**/*.unknown']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('No supported files matched "missing/**/*.unknown"');
});

test('does not treat unsupported files as unmatched patterns', () => {
  writeProjectFile('notes.unknown', 'plain text');

  const result = runFmt(['--no-error-on-unmatched-pattern', 'notes.unknown']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('No supported files matched "notes.unknown"');
});
