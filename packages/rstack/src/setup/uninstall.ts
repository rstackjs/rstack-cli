import { rmSync } from 'node:fs';
import path from 'node:path';
import {
  displayPath,
  fail,
  type FailedHooksResult,
  generatedDirectoryName,
  gitFailure,
  isSamePath,
  readOwner,
  resolveGitContext,
  resolveGitHooksPath,
  resolveHooksPathScope,
  runGit,
} from './git.ts';

export type UninstallHooksOptions = {
  cwd?: string;
};

export type UninstallHooksResult =
  | { status: 'uninstalled'; hooksPath: string }
  | {
      status: 'unchanged';
      reason: 'not-git-repository' | 'not-installed';
    }
  | FailedHooksResult;

const isInsideRepository = (gitRoot: string, directory: string): boolean => {
  const relativePath = path.relative(gitRoot, directory);
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
};

const unmanagedDirectory = (
  gitRoot: string,
  directory: string,
): FailedHooksResult =>
  fail(
    'hooks-directory-conflict',
    `Cannot uninstall Git hooks because "${displayPath(gitRoot, directory)}" is not managed by Rstack. No files were removed.`,
  );

export const uninstallHooks = ({
  cwd = process.cwd(),
}: UninstallHooksOptions = {}): UninstallHooksResult => {
  const context = resolveGitContext(cwd);
  if ('status' in context) {
    return context.status === 'skipped'
      ? { status: 'unchanged', reason: 'not-git-repository' }
      : context;
  }

  const {
    defaultHooksDirectory,
    effectiveHooksDirectory,
    gitRoot,
    projectPath,
  } = context;
  if (isSamePath(effectiveHooksDirectory, defaultHooksDirectory)) {
    return { status: 'unchanged', reason: 'not-installed' };
  }

  if (
    path.basename(effectiveHooksDirectory) !== generatedDirectoryName ||
    !isInsideRepository(gitRoot, effectiveHooksDirectory)
  ) {
    return unmanagedDirectory(gitRoot, effectiveHooksDirectory);
  }

  const owner = readOwner(effectiveHooksDirectory);
  if (!owner) {
    return unmanagedDirectory(gitRoot, effectiveHooksDirectory);
  }
  if (owner !== projectPath) {
    return fail(
      'owned-by-another-project',
      `Cannot uninstall Git hooks because "${displayPath(gitRoot, effectiveHooksDirectory)}" is owned by Rstack project "${owner}". No files were removed.`,
    );
  }

  const scope = resolveHooksPathScope(cwd);
  if (typeof scope === 'object') {
    return scope;
  }
  if (scope === 'command') {
    return fail(
      'hooks-path-command-scope',
      "Cannot uninstall Git hooks because core.hooksPath is set in Git's command scope. Remove the command-scoped override and rerun rs hooks uninstall.",
    );
  }
  if (scope !== 'local' && scope !== 'worktree') {
    const scopeName = scope ? `Git's ${scope} scope` : 'an unknown Git scope';
    return fail(
      'hooks-path-scope-conflict',
      `Cannot uninstall Git hooks because core.hooksPath is set in ${scopeName}. No files were removed.`,
    );
  }

  const configScope = scope === 'worktree' ? '--worktree' : '--local';
  const unset = runGit(cwd, [
    'config',
    configScope,
    '--unset',
    'core.hooksPath',
  ]);
  if (unset.error || unset.status === null) {
    return gitFailure(unset.error, unset.stderr);
  }
  if (unset.status !== 0) {
    return fail(
      'git-config-failed',
      `Failed to unset core.hooksPath in Git's ${scope} scope: ${unset.stderr.trim() || `Git exited with status ${unset.status}`}`,
    );
  }

  const remainingHooksDirectory = resolveGitHooksPath(cwd);
  if (typeof remainingHooksDirectory !== 'string') {
    return remainingHooksDirectory;
  }
  if (isSamePath(remainingHooksDirectory, effectiveHooksDirectory)) {
    return fail(
      'git-config-failed',
      `Failed to deactivate Rstack Git hooks because core.hooksPath still resolves to "${displayPath(gitRoot, effectiveHooksDirectory)}". Generated files were preserved.`,
    );
  }

  try {
    rmSync(effectiveHooksDirectory, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(
      'remove-failed',
      `Failed to remove generated Git hook files: ${message}`,
    );
  }

  return {
    status: 'uninstalled',
    hooksPath: displayPath(gitRoot, effectiveHooksDirectory),
  };
};
