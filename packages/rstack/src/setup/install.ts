import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHookFiles } from './hooks.js';

const hooksPath = '.rstack/hooks/_';
const gitignore = '*\n';

type InstallResult =
  | { status: 'installed'; hooksPath: string }
  | { status: 'unchanged'; hooksPath: string }
  | { status: 'skipped'; reason: 'not-git-repository' }
  | { status: 'failed'; reason: string; message: string };

const fail = (reason: string, message: string): InstallResult => ({
  status: 'failed',
  reason,
  message,
});

const runGit = (cwd: string, args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });

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

export const installHooks = (cwd: string = process.cwd()): InstallResult => {
  // Check Git before touching the filesystem so non-repositories have no side effects.
  const repository = runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (repository.error || repository.status === null) {
    return gitFailure(repository.error, repository.stderr);
  }
  if (repository.status !== 0 || repository.stdout.trim() !== 'true') {
    return { status: 'skipped', reason: 'not-git-repository' };
  }

  const config = runGit(cwd, ['config', '--local', '--get', 'core.hooksPath']);
  if (config.error || config.status === null) {
    return gitFailure(config.error, config.stderr);
  }
  if (config.status !== 0 && config.status !== 1) {
    return fail('git-config-failed', `Failed to read core.hooksPath: ${config.stderr.trim()}`);
  }

  const directory = path.join(cwd, hooksPath);
  const files = Object.entries(createHookFiles());
  // Skip all writes only when the config, generated content, and executable modes match.
  const unchanged =
    config.stdout.trim() === hooksPath &&
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
