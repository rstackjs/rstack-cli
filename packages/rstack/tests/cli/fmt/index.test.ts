import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const runCLI = (args: string[]) => {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
  delete env.FORCE_COLOR;

  return spawnSync(process.execPath, [RSTACK_BIN_PATH, ...args], {
    cwd: projectPath,
    encoding: 'utf8',
    env,
  });
};

const runFmt = (args: string[] = []) => runCLI(['fmt', ...args]);

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
  expect(result.stdout).toBe('index.ts\n');
  expect(result.stderr).toBe('');
  expect(readProjectFile('index.ts')).toBe('const message = "hello";\n');
});

test('returns exit code 1 for invalid arguments', () => {
  const result = runFmt(['--write', '--check']);

  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(
    'The --write, --check, and --list-different options cannot be used together.',
  );
});

test('formats the current directory with Prettier defaults', () => {
  writeProjectFile('index.ts', 'const message="hello"');

  const result = runFmt();

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('index.ts\n');
  expect(result.stderr).toBe('');
  expect(readProjectFile('index.ts')).toBe('const message = "hello";\n');
});

test('does not sort package.json by default', () => {
  writeProjectFile('package.json', packageJsonSource);

  const result = runFmt(['package.json']);

  expect(result.status).toBe(0);
  expect(readProjectFile('package.json')).toContain(
    '"dependencies": {\n    "z": "1.0.0",\n    "a": "1.0.0"',
  );
});

test.each([
  ['parallel execution', []],
  ['serial execution', ['--no-parallel']],
] as const)('sorts package.json with %s', (_, options) => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({ sortPackageJson: true });
`,
  );
  writeProjectFile('package.json', packageJsonSource);
  writeProjectFile('packages/example/package.json', packageJsonSource);

  const result = runFmt([...options, 'package.json', 'packages/example/package.json']);

  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(readProjectFile('package.json')).toBe(sortedPackageJson);
  expect(readProjectFile('packages/example/package.json')).toBe(sortedPackageJson);
});

test.each([
  ['disabling parallel execution', ['--no-parallel']],
  ['configuring parallel worker count', ['--parallel-workers', '1']],
] as const)('supports %s', (_, options) => {
  writeProjectFile('first.ts', 'const first="first"');
  writeProjectFile('second.ts', 'const second="second"');

  const result = runFmt([...options, 'first.ts', 'second.ts']);

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('first.ts\nsecond.ts\n');
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
  expect(result.stdout).toBe('index.ts\n');
  expect(result.stderr).toBe('');
  expect(readProjectFile('index.ts')).toBe('function getMessage() {\n  return "hello";\n}\n');
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
  expect(result.stdout).toBe('src/index.test.ts\nsrc/index.ts\n');
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
  expect(result.stdout).toBe('index.ts\n');
  expect(result.stderr).toBe('');
  expect(readProjectFile('index.ts')).toBe("const message = 'hello';\n");
});

test('checks formatting without writing files', () => {
  const source = 'const message="hello"';
  writeProjectFile('index.ts', source);

  const result = runFmt(['--check', 'index.ts']);

  expect(result.status).toBe(1);
  expect(result.stdout).toBe('Checking formatting...\n');
  expect(result.stderr).toContain('warn    index.ts');
  expect(result.stderr).toContain(
    'warn    Code style issues found in 1 file. Run rs fmt --write to fix.',
  );
  expect(readProjectFile('index.ts')).toBe(source);

  writeProjectFile('index.ts', 'const message = "hello";\n');
  const formattedResult = runFmt(['--check', 'index.ts']);

  expect(formattedResult.status).toBe(0);
  expect(formattedResult.stdout).toBe(
    'Checking formatting...\nAll matched files use Prettier code style!\n',
  );
  expect(formattedResult.stderr).toBe('');
});

test('lists only paths that differ', () => {
  const source = 'const message="hello"';
  writeProjectFile('src/index.ts', source);
  writeProjectFile('src/formatted.ts', 'const formatted = true;\n');

  const result = runFmt(['--list-different', 'src/*.ts']);

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

test.each([
  ['parallel execution', []],
  ['serial execution', ['--no-parallel']],
] as const)('formats with a project-local plugin using %s', (_, options) => {
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

  const result = runFmt([...options, '*.fixture']);

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('first.fixture\nsecond.fixture\n');
  expect(result.stderr).toBe('');
  expect(readProjectFile('first.fixture')).toBe('{ "first": true }\n');
  expect(readProjectFile('second.fixture')).toBe('{ "second": true }\n');
});

test('formats mixed plugin overrides in parallel', () => {
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
  expect(result.stdout).toBe('data.fixture\nindex.ts\n');
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

test('succeeds when no files can be formatted', () => {
  const result = runFmt(['missing/**/*.ts']);

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('');
});
