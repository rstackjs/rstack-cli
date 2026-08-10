import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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
  hooksDir?: string;
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
  | { status: 'installed'; hooksPath: string }
  | { status: 'unchanged'; hooksPath: string }
  | SkippedInstallResult
  | FailedInstallResult;

type GitContext = {
  defaultHooksDirectory: string;
  effectiveHooksDirectory: string;
  gitRoot: string;
  projectPath: string;
};

type GeneratedDirectoryState =
  { kind: 'empty' } | { kind: 'foreign' } | { kind: 'owned'; project: string };

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
    return fail('invalid-hooks-directory', 'Git hooks directory must not be empty.');
  }

  if (path.isAbsolute(resolvedDir)) {
    return fail(
      'invalid-hooks-directory',
      'Git hooks directory must be relative to the Git repository root.',
    );
  }

  if (resolvedDir.includes('..')) {
    return fail('invalid-hooks-directory', 'Git hooks directory must not contain "..".');
  }

  return resolvedDir;
};

const runGit = (cwd: string, args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });

const removeLineEnding = (value: string): string => value.replace(/\r?\n$/u, '');

const gitFailure = (
  error: NodeJS.ErrnoException | undefined,
  stderr: string,
): FailedInstallResult => {
  if (error?.code === 'ENOENT') {
    return fail('git-not-found', 'Git command not found.');
  }

  return fail('git-command-failed', `Failed to run Git: ${error?.message || stderr.trim()}`);
};

const resolveGitContext = (cwd: string): GitContext | InstallResult => {
  // Resolve every repository path in one Git process. `--git-path hooks`
  // accounts for an existing local or global core.hooksPath configuration.
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
    gitRoot,
    repositoryPrefix,
    gitCommonDirectory,
    effectiveHooksDirectory,
  ] = removeLineEnding(repository.stdout).split(/\r?\n/u);

  if (repository.status !== 0) {
    if (insideWorkTree.trim() === 'true') {
      return fail(
        'git-command-failed',
        `Failed to resolve the Git repository paths: ${repository.stderr.trim()}`,
      );
    }
    return skip('not-git-repository');
  }

  if (insideWorkTree.trim() !== 'true') {
    return skip('not-git-repository');
  }

  if (
    gitRoot === undefined ||
    repositoryPrefix === undefined ||
    gitCommonDirectory === undefined ||
    effectiveHooksDirectory === undefined
  ) {
    return fail('git-command-failed', 'Failed to resolve the Git repository paths.');
  }

  const normalizedPrefix = repositoryPrefix.replaceAll('\\', '/').replace(/\/$/u, '');

  return {
    defaultHooksDirectory: path.join(gitCommonDirectory, 'hooks'),
    effectiveHooksDirectory,
    gitRoot,
    projectPath: normalizedPrefix || '.',
  };
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

const isSamePath = (first: string, second: string): boolean =>
  path.resolve(first) === path.resolve(second);

const ownerContent = (project: string): string => `${project}\n`;

const readGeneratedDirectoryState = (directory: string): GeneratedDirectoryState => {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return { kind: 'empty' };
  }

  if (entries.includes(ownerFileName)) {
    try {
      const content = readFileSync(path.join(directory, ownerFileName), 'utf8');
      const project = removeLineEnding(content);
      return content === ownerContent(project) && project.length > 0 && !/[\r\n]/u.test(project)
        ? { kind: 'owned', project }
        : { kind: 'foreign' };
    } catch {
      return { kind: 'foreign' };
    }
  }

  return entries.every((entry) => entry === '.gitignore') ? { kind: 'empty' } : { kind: 'foreign' };
};

const displayPath = (gitRoot: string, filePath: string): string => {
  const relativePath = path.relative(gitRoot, filePath).replaceAll('\\', '/');
  return relativePath.length > 0 && !relativePath.startsWith('../') ? relativePath : filePath;
};

const ownerConflict = (project: string): SkippedInstallResult =>
  skip('owned-by-another-project', `Git hooks are already managed by Rstack project "${project}"`);

const directoryConflict = (gitRoot: string, directory: string): SkippedInstallResult =>
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
  const content = ownerContent(project);
  const state = readGeneratedDirectoryState(directory);

  if (state.kind === 'owned' && state.project !== project) {
    return ownerConflict(state.project);
  }
  if (state.kind === 'foreign') {
    return directoryConflict(gitRoot, directory);
  }

  if (state.kind === 'owned') {
    return undefined;
  }

  try {
    // Exclusive creation makes concurrent prepare scripts agree on one owner.
    writeFileSync(ownerPath, content, { flag: 'wx' });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code !== 'EEXIST') {
      throw error;
    }

    const concurrentState = readGeneratedDirectoryState(directory);
    if (concurrentState.kind === 'owned' && concurrentState.project === project) {
      return undefined;
    }
    if (concurrentState.kind === 'owned') {
      return ownerConflict(concurrentState.project);
    }
    return directoryConflict(gitRoot, directory);
  }

  return undefined;
};

const findExistingHooks = (directory: string): string[] =>
  hookNames.filter((name) => existsSync(path.join(directory, name)));

export const installHooks = ({
  cwd = process.cwd(),
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

  const { defaultHooksDirectory, effectiveHooksDirectory, gitRoot, projectPath } = context;
  const hooksPath = `${resolvedDir}/${generatedDirectoryName}`;
  const directory = path.join(gitRoot, resolvedDir, generatedDirectoryName);
  const hooksPathMatches = isSamePath(effectiveHooksDirectory, directory);
  const usesDefaultHooks = isSamePath(effectiveHooksDirectory, defaultHooksDirectory);

  if (!hooksPathMatches && !usesDefaultHooks) {
    const activeState = readGeneratedDirectoryState(effectiveHooksDirectory);
    if (activeState.kind === 'owned') {
      if (activeState.project !== projectPath) {
        return ownerConflict(activeState.project);
      }
    } else {
      return skip(
        'hooks-path-conflict',
        `Git hooks are already configured at "${displayPath(gitRoot, effectiveHooksDirectory)}"`,
      );
    }
  }

  if (usesDefaultHooks) {
    const existingHooks = findExistingHooks(defaultHooksDirectory);
    if (existingHooks.length > 0) {
      return skip(
        'existing-git-hooks',
        `existing Git hooks were found: ${existingHooks.join(', ')}`,
      );
    }
  }

  const files = Object.entries(createHookFiles());
  const expectedOwner = ownerContent(projectPath);
  // Skip all writes only when the config, owner, generated content, and executable modes match.
  const unchanged =
    hooksPathMatches &&
    isCurrentFile(path.join(directory, ownerFileName), expectedOwner) &&
    isCurrentFile(path.join(directory, '.gitignore'), gitignore) &&
    files.every(([name, content]) => isCurrentFile(path.join(directory, name), content, true));

  if (unchanged) {
    return { status: 'unchanged', hooksPath };
  }

  try {
    mkdirSync(directory, { recursive: true });
    const ownerResult = claimOwner(directory, gitRoot, projectPath);
    if (ownerResult) {
      return ownerResult;
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
