import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'rstack/test';
import { RSTACK_BIN_PATH } from '#test-helpers';

let projectPath: string;

const writeProjectFile = (filePath: string, content: string): string => {
  const absolutePath = path.join(projectPath, filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  return absolutePath;
};

const readProjectFile = (filePath: string): string =>
  readFileSync(path.join(projectPath, filePath), 'utf8');

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
  projectPath = mkdtempSync(path.join(import.meta.dirname, 'fmt-project-'));
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
  expect(topLevel.stdout).toContain('fmt      Format code');
  expect(fmt.status).toBe(0);
  expect(fmt.stdout).toContain('Usage:\n  $ rs fmt [options] [files/globs...]');
  expect(fmt.stderr).toBe('');
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

test('returns exit code 2 for unsupported plugins', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({
  plugins: ['prettier-plugin-example'],
});
`,
  );
  writeProjectFile('index.ts', 'const message="hello"');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('Prettier plugins are not supported yet.');
});

test('returns exit code 2 for formatting errors', () => {
  writeProjectFile('index.ts', 'const value = ;');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('error   index.ts: SyntaxError: Expression expected.');
});

test('succeeds when no files can be formatted', () => {
  const result = runFmt(['missing/**/*.ts']);

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe('');
});
