import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHookFiles } from './hooks.ts';

const defaultHooksDir = '.rstack/hooks';
const gitignore = '*\n';

type InstallHooksOptions = {
  cwd?: string;
  hooksDir?: string;
};

type FailedInstallResult = {
  status: 'failed';
  reason: string;
  message: string;
};

type InstallResult =
  | { status: 'installed'; hooksPath: string }
  | { status: 'unchanged'; hooksPath: string }
  | { status: 'skipped'; reason: string }
  | FailedInstallResult;

const fail = (reason: string, message: string): FailedInstallResult => ({
  status: 'failed',
  reason,
  message,
});

const resolveHooksDir = (hooksDir: string): string | FailedInstallResult => {
  const resolvedDir = hooksDir.replaceAll('\\', '/');

  if (resolvedDir.length === 0) {
    return fail('invalid-hooks-directory', 'Git hooks directory must not be empty.');
  }

  if (path.isAbsolute(resolvedDir)) {
    return fail(
      'invalid-hooks-directory',
      'Git hooks directory must be relative to the current directory.',
    );
  }

  return resolvedDir;
};

const runGit = (cwd: string, args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });

const removeLineEnding = (value: string): string => value.replace(/\r?\n$/u, '');

const gitFailure = (error: NodeJS.ErrnoException | undefined, stderr: string): InstallResult => {
  if (error?.code === 'ENOENT') {
    return fail('git-not-found', 'Git command not found.');
  }

  return fail('git-command-failed', `Failed to run Git: ${error?.message || stderr.trim()}`);
};

const isCurrentFile = (filePath: string, content: string, executable = false): boolean => {
  try {
    // Windows does not expose POSIX executable bits, but Git for Windows still runs hook shims.
    return (
      readFileSync(filePath, 'utf8') === content &&
      (!executable || process.platform === 'win32' || (statSync(filePath).mode & 0o777) === 0o755)
    );
  } catch {
    return false;
  }
};

export const installHooks = ({
  cwd = process.cwd(),
  hooksDir = defaultHooksDir,
}: InstallHooksOptions = {}): InstallResult => {
  if (process.env.RSTACK_HOOKS === '0') {
    return { status: 'skipped', reason: 'disabled' };
  }

  const resolvedDir = resolveHooksDir(hooksDir);
  if (typeof resolvedDir !== 'string') {
    return resolvedDir;
  }

  // Check Git before touching the filesystem so non-repositories have no side effects.
  const repository = runGit(cwd, ['rev-parse', '--is-inside-work-tree', '--show-prefix']);
  if (repository.error || repository.status === null) {
    return gitFailure(repository.error, repository.stderr);
  }

  const firstLineEnd = repository.stdout.indexOf('\n');
  const insideWorkTree = (
    firstLineEnd === -1 ? repository.stdout : repository.stdout.slice(0, firstLineEnd)
  ).trim();

  if (repository.status !== 0) {
    if (insideWorkTree === 'true') {
      return fail(
        'git-command-failed',
        `Failed to resolve the Git repository prefix: ${repository.stderr.trim()}`,
      );
    }
    return { status: 'skipped', reason: 'not-git-repository' };
  }

  if (insideWorkTree !== 'true') {
    return { status: 'skipped', reason: 'not-git-repository' };
  }

  const prefix =
    firstLineEnd === -1
      ? ''
      : removeLineEnding(repository.stdout.slice(firstLineEnd + 1)).replaceAll('\\', '/');
  const hooksPath = `${prefix}${resolvedDir}/_`;

  const config = runGit(cwd, ['config', '--local', '--get', 'core.hooksPath']);
  if (config.error || config.status === null) {
    return gitFailure(config.error, config.stderr);
  }
  if (config.status !== 0 && config.status !== 1) {
    return fail('git-config-failed', `Failed to read core.hooksPath: ${config.stderr.trim()}`);
  }

  const directory = path.join(cwd, resolvedDir, '_');
  const files = Object.entries(createHookFiles());
  // Skip all writes only when the config, generated content, and executable modes match.
  const unchanged =
    removeLineEnding(config.stdout) === hooksPath &&
    isCurrentFile(path.join(directory, '.gitignore'), gitignore) &&
    files.every(([name, content]) => isCurrentFile(path.join(directory, name), content, true));

  if (unchanged) {
    return { status: 'unchanged', hooksPath };
  }

  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, '.gitignore'), gitignore);

    for (const [name, content] of files) {
      const filePath = path.join(directory, name);
      writeFileSync(filePath, content);
      // chmod also repairs existing files because writeFile does not update their mode.
      chmodSync(filePath, 0o755);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail('write-failed', `Failed to write Git hook files: ${message}`);
  }

  // Point Git at the generated directory only after every runtime file is ready.
  const configured = runGit(cwd, ['config', '--local', 'core.hooksPath', hooksPath]);
  if (configured.error || configured.status === null) {
    return gitFailure(configured.error, configured.stderr);
  }
  if (configured.status !== 0) {
    return fail(
      'git-config-failed',
      `Failed to configure core.hooksPath: ${configured.stderr.trim()}`,
    );
  }

  return { status: 'installed', hooksPath };
};
