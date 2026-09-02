import { expect, test } from 'rstack/test';
import { normalizeHelpOutput } from '#test-helpers';
import { setupFmtTest } from './fmt/helpers.ts';

const { runCLI, writeProjectFile } = setupFmtTest();
const runCheck = (args: string[] = []) => runCLI(['check', ...args]);

const writeLintConfig = (): void => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from "rstack";

define.lint([
  {
    files: ["**/*.{js,ts}"],
    rules: { "no-debugger": "error" },
  },
]);
`,
  );
};

test('displays check help without loading config', () => {
  writeProjectFile('rstack.config.ts', 'throw new Error("must not load");\n');

  const result = runCheck(['--help']);

  expect(normalizeHelpOutput(result.stdout)).toMatchSnapshot();
});

test('runs lint followed by a formatting check', () => {
  writeLintConfig();
  writeProjectFile('src/index.ts', 'const value=true');

  const unformatted = runCheck();

  expect(unformatted.status).toBe(1);
  expect(unformatted.stdout).toContain('Checking formatting...');
  expect(unformatted.stderr).toContain(
    'Formatting issues found in 1 file. Run rs fmt to fix.',
  );

  writeProjectFile('src/index.ts', 'const value = true;\n');
  const formatted = runCheck();

  expect(formatted.status).toBe(0);
  expect(formatted.stdout).toContain('Format check passed in');
  expect(formatted.stderr).toBe('');
});

test('passes file arguments to lint and the formatting check', () => {
  writeLintConfig();
  writeProjectFile('src/selected-a.ts', 'const selectedA = true;\n');
  writeProjectFile('src/selected-b.ts', 'const selectedB = true;\n');
  writeProjectFile('src/unselected-lint-error.ts', 'debugger;\n');
  writeProjectFile('src/unselected-format-error.ts', 'const value=true');

  const result = runCheck(['src/selected-a.ts', 'src/selected-b.ts']);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Format check passed in');
  expect(result.stdout).toContain('(2 files)');
  expect(result.stderr).toBe('');
});

test('supports file arguments after the option terminator', () => {
  writeLintConfig();
  writeProjectFile('--selected.ts', 'const selected = true;\n');

  const result = runCheck(['--', '--selected.ts']);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Format check passed in');
  expect(result.stdout).toContain('(1 file)');
  expect(result.stderr).toBe('');
});

test('enables type checking only with --type-check', () => {
  writeLintConfig();
  writeProjectFile(
    'tsconfig.json',
    `{
  "compilerOptions": {
    "strict": true
  },
  "include": ["src"]
}
`,
  );
  writeProjectFile('src/index.ts', 'const value: string = 1;\n');

  const withoutTypeCheck = runCheck();
  const withTypeCheck = runCheck(['--type-check']);

  expect(withoutTypeCheck.status).toBe(0);
  expect(withTypeCheck.status).toBe(1);
  expect(`${withTypeCheck.stdout}\n${withTypeCheck.stderr}`).toContain(
    'TS2322',
  );
});

test('does not run the formatting check when lint fails', () => {
  writeLintConfig();
  writeProjectFile('src/index.js', 'debugger;\n');

  const result = runCheck();

  expect(result.status).toBe(1);
  expect(`${result.stdout}\n${result.stderr}`).toContain(
    "Unexpected 'debugger' statement",
  );
  expect(result.stdout).not.toContain('Checking formatting...');
});
