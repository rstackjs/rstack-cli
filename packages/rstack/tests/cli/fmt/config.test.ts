import { expect, test } from 'rstack/test';
import {
  expectWriteSummary,
  packageJsonSource,
  setupFmtTest,
  sortedPackageJson,
} from './helpers.ts';

const { readProjectFile, runFmt, writeFixturePlugin, writeProjectFile } =
  setupFmtTest();

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
  expect(readProjectFile('packages/example/package.json')).toBe(
    sortedPackageJson,
  );
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
  writeProjectFile(
    '.prettierrc.json',
    '{ "singleQuote": true, "semi": false }\n',
  );
  writeProjectFile('.prettierignore', 'index.ts\n');
  writeProjectFile(
    '.editorconfig',
    'root = true\n\n[*]\nindent_style = space\nindent_size = 8\n',
  );
  writeProjectFile(
    'index.ts',
    "function getMessage(){\n        return 'hello'\n}",
  );

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 1, 1);
  expect(result.stderr).toBe('');
  expect(readProjectFile('index.ts')).toBe(
    'function getMessage() {\n  return "hello";\n}\n',
  );
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
  expect(readProjectFile('src/ignored-by-root.ts')).toBe(
    'const root="ignored"',
  );
  expect(readProjectFile('src/ignored-by-extra.ts')).toBe(
    'const extra="ignored"',
  );
  expect(readProjectFile('src/index.ts')).toBe('const index = "formatted";\n');
});

test('returns exit code 2 for an unreadable ignore path', () => {
  writeProjectFile('index.ts', 'const value=true');

  const result = runFmt(['--ignore-path', 'missing.ignore', 'index.ts']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(
    'Failed to read ignore file "missing.ignore".',
  );
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

test('returns exit code 2 for config errors', () => {
  writeProjectFile(
    'rstack.config.ts',
    'throw new Error("invalid fmt config");\n',
  );

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

test('runs prettier-plugin-tailwindcss for JavaScript and TypeScript', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cn'],
});
`,
  );
  const unsortedClasses = `const classes = cn("px-4 flex items-center");\n`;
  writeProjectFile('index.js', unsortedClasses);
  writeProjectFile('index.ts', unsortedClasses);

  const result = runFmt(['index.js', 'index.ts']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 2, 2);
  expect(result.stderr).toBe('');
  const sortedClasses = `const classes = cn("flex items-center px-4");\n`;
  expect(readProjectFile('index.js')).toBe(sortedClasses);
  expect(readProjectFile('index.ts')).toBe(sortedClasses);
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
