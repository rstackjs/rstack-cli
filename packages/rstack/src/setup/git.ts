import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const generatedDirectoryName = '_';
export const ownerFileName = '.owner';

export type FailedHooksResult = {
  status: 'failed';
  reason: string;
  message: string;
};

export type GitContext = {
  defaultHooksDirectory: string;
  effectiveHooksDirectory: string;
  gitRoot: string;
  projectPath: string;
};

export type HooksPathScope =
  'command' | 'worktree' | 'local' | 'global' | 'system';

export const fail = (reason: string, message: string): FailedHooksResult => ({
  status: 'failed',
  reason,
  message,
});

export const runGit = (cwd: string, args: string[]): SpawnSyncReturns<string> =>
  spawnSync('git', args, { cwd, encoding: 'utf8' });

const removeLineEnding = (value: string): string =>
  value.replace(/\r?\n$/u, '');

export const gitFailure = (
  error: NodeJS.ErrnoException | undefined,
  stderr: string,
): FailedHooksResult => {
  if (error?.code === 'ENOENT') {
    return fail('git-not-found', 'Git command not found.');
  }

  return fail(
    'git-command-failed',
    `Failed to run Git: ${error?.message || stderr.trim()}`,
  );
};

export const resolveHooksPathScope = (
  cwd: string,
): HooksPathScope | FailedHooksResult | undefined => {
  const configured = runGit(cwd, [
    'config',
    '--show-scope',
    '--get',
    'core.hooksPath',
  ]);
  if (configured.error || configured.status === null) {
    return gitFailure(configured.error, configured.stderr);
  }

  // Exit status 1 means core.hooksPath is not configured yet.
  if (configured.status === 1) {
    return undefined;
  }
  if (configured.status !== 0) {
    return fail(
      'git-config-failed',
      `Failed to resolve the core.hooksPath scope: ${configured.stderr.trim()}`,
    );
  }

  const separator = configured.stdout.indexOf('\t');
  const scope = separator === -1 ? '' : configured.stdout.slice(0, separator);
  if (
    scope === 'command' ||
    scope === 'worktree' ||
    scope === 'local' ||
    scope === 'global' ||
    scope === 'system'
  ) {
    return scope;
  }

  return fail(
    'git-config-failed',
    'Failed to resolve the core.hooksPath scope.',
  );
};

export const resolveGitHooksPath = (
  cwd: string,
): string | FailedHooksResult => {
  const hooksDirectory = runGit(cwd, [
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'hooks',
  ]);
  if (hooksDirectory.error || hooksDirectory.status === null) {
    return gitFailure(hooksDirectory.error, hooksDirectory.stderr);
  }
  if (hooksDirectory.status !== 0) {
    return fail(
      'git-command-failed',
      `Failed to resolve the Git hooks path: ${hooksDirectory.stderr.trim()}`,
    );
  }

  const resolvedDirectory = removeLineEnding(hooksDirectory.stdout);
  if (!resolvedDirectory) {
    return fail('git-command-failed', 'Failed to resolve the Git hooks path.');
  }
  return resolvedDirectory;
};

export const resolveGitContext = (
  cwd: string,
):
  | GitContext
  | FailedHooksResult
  | { status: 'skipped'; reason: 'not-git-repository' } => {
  // Resolve every repository path in one Git process. `--git-path hooks`
  // accounts for the effective core.hooksPath configuration across Git scopes.
  const repository = runGit(cwd, [
    'rev-parse',
    '--is-inside-work-tree',
    '--path-format=absolute',
    '--show-toplevel',
    '--show-prefix',
    '--git-common-dir',
    '--git-path',
    'hooks',
  ]);
  if (repository.error || repository.status === null) {
    return gitFailure(repository.error, repository.stderr);
  }

  const [
    insideWorkTree = '',
    gitRoot = '',
    repositoryPrefix = '',
    gitCommonDirectory = '',
    effectiveHooksDirectory = '',
  ] = removeLineEnding(repository.stdout).split(/\r?\n/u);

  if (insideWorkTree !== 'true') {
    return { status: 'skipped', reason: 'not-git-repository' };
  }

  if (repository.status !== 0) {
    return fail(
      'git-command-failed',
      `Failed to resolve the Git repository paths: ${repository.stderr.trim()}`,
    );
  }

  if (!gitRoot || !gitCommonDirectory || !effectiveHooksDirectory) {
    return fail(
      'git-command-failed',
      'Failed to resolve the Git repository paths.',
    );
  }

  return {
    defaultHooksDirectory: path.join(gitCommonDirectory, 'hooks'),
    effectiveHooksDirectory,
    gitRoot,
    projectPath:
      repositoryPrefix.replaceAll('\\', '/').replace(/\/$/u, '') || '.',
  };
};

export const isSamePath = (first: string, second: string): boolean =>
  path.resolve(first) === path.resolve(second);

export const readOwner = (directory: string): string | undefined => {
  try {
    const content = readFileSync(path.join(directory, ownerFileName), 'utf8');
    const owner = removeLineEnding(content);
    return content === `${owner}\n` &&
      owner.length > 0 &&
      !/[\r\n]/u.test(owner)
      ? owner
      : undefined;
  } catch {
    return undefined;
  }
};

export const displayPath = (gitRoot: string, filePath: string): string => {
  const relativePath = path.relative(gitRoot, filePath).replaceAll('\\', '/');
  return relativePath.length > 0 && !relativePath.startsWith('../')
    ? relativePath
    : filePath;
};
