import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect } from 'rstack/test';
import { RSTACK_BIN_PATH } from '#test-helpers';

export const packageJsonSource =
  '{"dependencies":{"z":"1.0.0","a":"1.0.0"},"type":"module","version":"1.0.0","name":"fixture"}';
export const sortedPackageJson =
  '{\n  "name": "fixture",\n  "version": "1.0.0",\n  "type": "module",\n  "dependencies": {\n    "a": "1.0.0",\n    "z": "1.0.0"\n  }\n}\n';

type RunCLI = (
  args: string[],
  input?: string,
  cwd?: string,
) => SpawnSyncReturns<string>;

type FmtTestHarness = {
  projectFileExists: (filePath: string) => boolean;
  readProjectFile: (filePath: string) => string;
  resolveProjectPath: (filePath: string) => string;
  runCLI: RunCLI;
  runFmt: (args?: string[], cwd?: string) => SpawnSyncReturns<string>;
  runFmtStdin: (args: string[], input: string) => SpawnSyncReturns<string>;
  writeFixturePlugin: () => void;
  writeProjectFile: (filePath: string, content: string) => void;
};

/** Environment for spawning the CLI with color output disabled. */
export const createCliEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
  delete env.FORCE_COLOR;

  return env;
};

export const normalizeDuration = (output: string): string =>
  output.replace(
    /<1ms|\d+ms|\d+h\d+m\d+(?:\.\d+)?s|\d+m\d+(?:\.\d+)?s|\d+(?:\.\d+)?s/g,
    '<duration>',
  );

export const expectWriteSummary = (
  output: string,
  matchedFileCount: number,
  writtenCount: number,
): void => {
  const files = matchedFileCount === 1 ? 'file' : 'files';
  const message = writtenCount
    ? `Formatted ${writtenCount} of ${matchedFileCount} ${files} in <duration>.`
    : `Checked ${matchedFileCount} ${files} in <duration>. No changes needed.`;
  expect(normalizeDuration(output)).toBe(
    `start   Formatting...\nsuccess ${message}\n`,
  );
};

export const setupFmtTest = (): FmtTestHarness => {
  let projectPath: string;

  const resolveProjectPath = (filePath: string): string =>
    path.join(projectPath, filePath);

  const projectFileExists = (filePath: string): boolean =>
    existsSync(resolveProjectPath(filePath));

  const writeProjectFile = (filePath: string, content: string): void => {
    const absolutePath = resolveProjectPath(filePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  };

  const readProjectFile = (filePath: string): string =>
    readFileSync(resolveProjectPath(filePath), 'utf8');

  const writeFixturePlugin = (): void => {
    writeProjectFile(
      'node_modules/prettier-plugin-fixture/package.json',
      JSON.stringify({
        name: 'prettier-plugin-fixture',
        exports: './index.mjs',
      }),
    );
    writeProjectFile(
      'node_modules/prettier-plugin-fixture/index.mjs',
      `export default {
  languages: [{ name: 'Fixture JSON', parsers: ['json'], extensions: ['.fixture'] }],
};
`,
    );
  };

  const runCLI: RunCLI = (args, input, cwd = projectPath) =>
    spawnSync(process.execPath, [RSTACK_BIN_PATH, ...args], {
      cwd,
      encoding: 'utf8',
      env: createCliEnv(),
      input,
    });

  const runFmt = (args: string[] = [], cwd = projectPath) =>
    runCLI(['fmt', ...args], undefined, cwd);

  const runFmtStdin = (args: string[], input: string) =>
    runCLI(['fmt', ...args], input);

  beforeEach(() => {
    projectPath = mkdtempSync(path.join(import.meta.dirname, 'test-temp-fmt-'));
    // Prevent repository-level ignore rules from affecting the fixture.
    mkdirSync(path.join(projectPath, '.git'));
    writeProjectFile('rstack.config.ts', 'export {};\n');
  });

  afterEach(() => {
    rmSync(projectPath, { force: true, recursive: true });
  });

  return {
    projectFileExists,
    readProjectFile,
    resolveProjectPath,
    runCLI,
    runFmt,
    runFmtStdin,
    writeFixturePlugin,
    writeProjectFile,
  };
};
