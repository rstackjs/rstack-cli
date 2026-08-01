import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const hooksDir = '.rstack/hooks';

export const hooksPath: string = `${hooksDir}/_`;

export const git = (
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): SpawnSyncReturns<string> => spawnSync('git', args, { cwd, encoding: 'utf8', env });

export const runGit = (cwd: string, args: string[]): string => {
  const result = git(cwd, args);
  if (result.status !== 0) {
    throw new Error(result.stderr || `Git exited with status ${result.status}`);
  }
  return result.stdout.trim();
};

export const withDirectory = (callback: (cwd: string) => void): void => {
  const cwd = mkdtempSync(path.join(import.meta.dirname, 'test-temp-rstack hooks '));
  const gitCeilingDirectories = process.env.GIT_CEILING_DIRECTORIES;
  // Keep Git from treating the temporary directory as part of this repository.
  process.env.GIT_CEILING_DIRECTORIES = import.meta.dirname;

  try {
    callback(cwd);
  } finally {
    restoreEnv('GIT_CEILING_DIRECTORIES', gitCeilingDirectories);
    rmSync(cwd, { force: true, recursive: true });
  }
};

export const restoreEnv = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
};

const hookEnv = (cwd: string, value?: string): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(cwd, '.git', 'xdg'),
  };

  if (value !== undefined) {
    env.RSTACK_HOOKS = value;
  }

  return env;
};

export const writeHook = (cwd: string, content: string, directory: string = hooksDir): void => {
  const filePath = path.join(cwd, directory, 'pre-commit');
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
};

export const writeInit = (cwd: string, content: string): void => {
  const filePath = path.join(cwd, '.git', 'xdg', 'rstack', 'hooks-init.sh');
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
};

export const runHook = (cwd: string, value?: string): SpawnSyncReturns<string> =>
  git(cwd, ['hook', 'run', 'pre-commit'], hookEnv(cwd, value));

export const withRepository = (callback: (cwd: string) => void): void =>
  withDirectory((cwd) => {
    const globalConfig = process.env.GIT_CONFIG_GLOBAL;
    const noSystemConfig = process.env.GIT_CONFIG_NOSYSTEM;
    process.env.GIT_CONFIG_GLOBAL = path.join(cwd, 'global.gitconfig');
    process.env.GIT_CONFIG_NOSYSTEM = '1';

    try {
      runGit(cwd, ['init', '--quiet']);
      callback(cwd);
    } finally {
      restoreEnv('GIT_CONFIG_GLOBAL', globalConfig);
      restoreEnv('GIT_CONFIG_NOSYSTEM', noSystemConfig);
    }
  });
