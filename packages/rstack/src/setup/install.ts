import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createHookFiles, hookNames } from './hooks.ts';

const defaultHooksDir = '.rstack/hooks';
const generatedDirectoryName = '_';
const ownerFileName = '.owner';
const gitignore = '*\n';

type InstallHooksOptions = {
  cwd?: string;
  force?: boolean;
  hooksDir?: string;
};

type InactiveHooks = {
  hooks: string[];
  path: string;
  restore: 'configure' | 'unset';
};

type FailedInstallResult = {
  status: 'failed';
  reason: string;
  message: string;
};

type SkippedInstallResult = {
  status: 'skipped';
  reason: string;
  message?: string;
};

type InstallResult =
  | { status: 'installed'; hooksPath: string; inactiveHooks?: InactiveHooks }
  | { status: 'unchanged'; hooksPath: string }
  | SkippedInstallResult
  | FailedInstallResult;

type GitContext = {
  defaultHooksDirectory: string;
  effectiveHooksDirectory: string;
  gitRoot: string;
  projectPath: string;
};

type GitConfigScopeOption = '--local' | '--worktree';

const fail = (reason: string, message: string): FailedInstallResult => ({
  status: 'failed',
  reason,
  message,
});

const skip = (reason: string, message?: string): SkippedInstallResult => ({
  status: 'skipped',
  reason,
  ...(message ? { message } : {}),
});

const resolveHooksDir = (hooksDir: string): string | FailedInstallResult => {
  const resolvedDir = hooksDir.replaceAll('\\', '/');

  if (resolvedDir.length === 0) {
    return fail(
      'invalid-hooks-directory',
      'Git hooks directory must not be empty.',
    );
  }

  if (path.isAbsolute(resolvedDir)) {
    return fail(
      'invalid-hooks-directory',
      'Git hooks directory must be relative to the Git repository root.',
    );
  }

  if (resolvedDir.includes('..')) {
    return fail(
      'invalid-hooks-directory',
      'Git hooks directory must not contain "..".',
    );
  }

  return resolvedDir;
};

const runGit = (cwd: string, args: string[]) =>
  spawnSync('git', args, { cwd, encoding: 'utf8' });

const removeLineEnding = (value: string): string =>
  value.replace(/\r?\n$/u, '');

const gitFailure = (
  error: NodeJS.ErrnoException | undefined,
  stderr: string,
): FailedInstallResult => {
  if (error?.code === 'ENOENT') {
    return fail('git-not-found', 'Git command not found.');
  }

  return fail(
    'git-command-failed',
    `Failed to run Git: ${error?.message || stderr.trim()}`,
  );
};

const resolveHooksPathScope = (
  cwd: string,
): GitConfigScopeOption | FailedInstallResult => {
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
    return '--local';
  }
  if (configured.status !== 0) {
    return fail(
      'git-config-failed',
      `Failed to resolve the core.hooksPath scope: ${configured.stderr.trim()}`,
    );
  }

  const separator = configured.stdout.indexOf('\t');
  const scope = separator === -1 ? '' : configured.stdout.slice(0, separator);
  if (scope === 'worktree') {
    return '--worktree';
  }
  if (scope === 'command') {
    return fail(
      'hooks-path-command-scope',
      "Cannot configure core.hooksPath because it is set in Git's command scope. Remove the command-scoped override and rerun rs setup.",
    );
  }
  if (scope === 'system' || scope === 'global' || scope === 'local') {
    return '--local';
  }

  return fail(
    'git-config-failed',
    'Failed to resolve the core.hooksPath scope.',
  );
};

const resolveGitHooksPath = (cwd: string): string | FailedInstallResult => {
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

const resolveGitContext = (cwd: string): GitContext | InstallResult => {
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
    return skip('not-git-repository');
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

const isCurrentFile = (
  filePath: string,
  content: string,
  executable = false,
): boolean => {
  try {
    // Windows does not expose POSIX executable bits, but Git for Windows still runs hook shims.
    return (
      readFileSync(filePath, 'utf8') === content &&
      (!executable ||
        process.platform === 'win32' ||
        (statSync(filePath).mode & 0o777) === 0o755)
    );
  } catch {
    return false;
  }
};

const isSamePath = (first: string, second: string): boolean =>
  path.resolve(first) === path.resolve(second);

const readOwner = (directory: string): string | undefined => {
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

const displayPath = (gitRoot: string, filePath: string): string => {
  const relativePath = path.relative(gitRoot, filePath).replaceAll('\\', '/');
  return relativePath.length > 0 && !relativePath.startsWith('../')
    ? relativePath
    : filePath;
};

const ownerConflict = (project: string): SkippedInstallResult =>
  skip(
    'owned-by-another-project',
    `Git hooks are already managed by Rstack project "${project}"`,
  );

const directoryConflict = (
  gitRoot: string,
  directory: string,
): SkippedInstallResult =>
  skip(
    'hooks-directory-conflict',
    `the hooks directory "${displayPath(gitRoot, directory)}" is not managed by Rstack`,
  );

const claimOwner = (
  directory: string,
  gitRoot: string,
  project: string,
): SkippedInstallResult | undefined => {
  const ownerPath = path.join(directory, ownerFileName);
  const owner = readOwner(directory);

  if (owner) {
    return owner === project ? undefined : ownerConflict(owner);
  }

  try {
    // Exclusive creation makes concurrent prepare scripts agree on one owner.
    writeFileSync(ownerPath, `${project}\n`, { flag: 'wx' });
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error ? error.code : undefined;
    if (code !== 'EEXIST') {
      throw error;
    }

    const concurrentOwner = readOwner(directory);
    if (!concurrentOwner) {
      return directoryConflict(gitRoot, directory);
    }
    return concurrentOwner === project
      ? undefined
      : ownerConflict(concurrentOwner);
  }

  return undefined;
};

const findExistingHooks = (directory: string): string[] =>
  hookNames.filter((name) => existsSync(path.join(directory, name)));

export const installHooks = ({
  cwd = process.cwd(),
  force = false,
  hooksDir = defaultHooksDir,
}: InstallHooksOptions = {}): InstallResult => {
  if (process.env.RSTACK_HOOKS === '0') {
    return skip('disabled');
  }

  const resolvedDir = resolveHooksDir(hooksDir);
  if (typeof resolvedDir !== 'string') {
    return resolvedDir;
  }

  // Check Git before touching the filesystem so non-repositories have no side effects.
  const context = resolveGitContext(cwd);
  if ('status' in context) {
    return context;
  }

  const {
    defaultHooksDirectory,
    effectiveHooksDirectory,
    gitRoot,
    projectPath,
  } = context;
  const hooksPath = `${resolvedDir}/${generatedDirectoryName}`;
  const directory = path.join(gitRoot, resolvedDir, generatedDirectoryName);
  const hooksPathMatches = isSamePath(effectiveHooksDirectory, directory);
  const usesDefaultHooks = isSamePath(
    effectiveHooksDirectory,
    defaultHooksDirectory,
  );
  let inactiveHooks: InactiveHooks | undefined;

  if (!hooksPathMatches && !usesDefaultHooks) {
    const activeOwner = readOwner(effectiveHooksDirectory);
    if (!activeOwner) {
      if (!force) {
        return skip(
          'hooks-path-conflict',
          `Git hooks are already configured at "${displayPath(gitRoot, effectiveHooksDirectory)}"`,
        );
      }

      inactiveHooks = {
        hooks: findExistingHooks(effectiveHooksDirectory),
        path: displayPath(gitRoot, effectiveHooksDirectory),
        restore: 'configure',
      };
    } else if (activeOwner !== projectPath) {
      return ownerConflict(activeOwner);
    }
  }

  if (usesDefaultHooks) {
    const existingHooks = findExistingHooks(defaultHooksDirectory);
    if (existingHooks.length > 0) {
      if (!force) {
        return skip(
          'existing-git-hooks',
          `existing Git hooks were found: ${existingHooks.join(', ')}`,
        );
      }

      inactiveHooks = {
        hooks: existingHooks,
        path: displayPath(gitRoot, defaultHooksDirectory),
        restore: 'unset',
      };
    }
  }

  // Preserve a worktree-scoped override instead of writing a shadowed local value.
  const configScope = hooksPathMatches ? '--local' : resolveHooksPathScope(cwd);
  if (typeof configScope !== 'string') {
    return configScope;
  }

  const files = Object.entries(createHookFiles());
  try {
    mkdirSync(directory, { recursive: true });
    const ownerResult = claimOwner(directory, gitRoot, projectPath);
    if (ownerResult) {
      return ownerResult;
    }

    // Skip generated file writes when their content and executable modes match.
    const unchanged =
      hooksPathMatches &&
      isCurrentFile(path.join(directory, '.gitignore'), gitignore) &&
      files.every(([name, content]) =>
        isCurrentFile(path.join(directory, name), content, true),
      );
    if (unchanged) {
      return { status: 'unchanged', hooksPath };
    }

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

  // Avoid rewriting .git/config when only the generated files needed repair.
  if (hooksPathMatches) {
    return { status: 'installed', hooksPath };
  }

  // Point Git at the generated directory only after every runtime file is ready.
  const configured = runGit(cwd, [
    'config',
    configScope,
    'core.hooksPath',
    hooksPath,
  ]);
  if (configured.error || configured.status === null) {
    return gitFailure(configured.error, configured.stderr);
  }
  if (configured.status !== 0) {
    return fail(
      'git-config-failed',
      `Failed to configure core.hooksPath: ${configured.stderr.trim()}`,
    );
  }

  const configuredHooksPath = resolveGitHooksPath(cwd);
  if (typeof configuredHooksPath !== 'string') {
    return configuredHooksPath;
  }
  if (!isSamePath(configuredHooksPath, directory)) {
    return fail(
      'git-config-failed',
      `Failed to activate Rstack Git hooks: core.hooksPath resolves to "${displayPath(gitRoot, configuredHooksPath)}" instead of "${hooksPath}".`,
    );
  }

  return {
    status: 'installed',
    hooksPath,
    ...(inactiveHooks ? { inactiveHooks } : {}),
  };
};
