import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  contextStoreSchemaVersion,
  type ContextDescriptor,
  type ContextFreshness,
  type ContextInputFile,
  type ContextRunManifest,
  type ContextSnapshot,
} from './model.ts';

type ExplicitContextOptions = {
  producer: 'rslint' | 'rstest';
  workspaceRoot: string;
  packageRoot: string;
  packageName?: string;
  configPath?: string;
};

type ExplicitRunOptions = {
  producer: 'rslint' | 'rstest';
  context: ContextDescriptor;
  command: string;
  now?: () => Date;
  createRunId?: () => string;
};

type ExplicitCaptureTargetRequest = {
  packageRoot?: string;
  configPath?: string;
};

type ExplicitCaptureTarget = {
  packageRoot: string;
  packageName?: string;
  configPath?: string;
};

const rstackConfigFileNames = [
  'rstack.config.ts',
  'rstack.config.js',
  'rstack.config.mts',
  'rstack.config.mjs',
] as const;

const toWorkspacePath = (workspaceRoot: string, filePath: string): string => {
  const relativePath = path
    .relative(path.resolve(workspaceRoot), path.resolve(workspaceRoot, filePath))
    .split(path.sep)
    .join('/');
  return relativePath || '.';
};

const digest = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

const resolveInternalConfigPath = (moduleDirectory: string, fileName: string): string => {
  const siblingPath = path.join(moduleDirectory, fileName);
  return existsSync(siblingPath) ? siblingPath : path.join(moduleDirectory, '..', fileName);
};

const readPackageName = async (packageRoot: string): Promise<string | undefined> => {
  try {
    const packageJson: unknown = JSON.parse(
      await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
    );
    return typeof packageJson === 'object' &&
      packageJson !== null &&
      'name' in packageJson &&
      typeof packageJson.name === 'string'
      ? packageJson.name
      : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
};

const findPackageConfig = async (packageRoot: string): Promise<string | undefined> => {
  for (const fileName of rstackConfigFileNames) {
    const configPath = path.join(packageRoot, fileName);
    try {
      await access(configPath);
      return configPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return undefined;
};

const resolveExplicitCaptureTarget = async (
  workspaceRoot: string,
  request: ExplicitCaptureTargetRequest,
): Promise<ExplicitCaptureTarget> => {
  const packageRoot = path.resolve(workspaceRoot, request.packageRoot ?? '.');
  const configPath =
    request.configPath === undefined
      ? await findPackageConfig(packageRoot)
      : path.resolve(workspaceRoot, request.configPath);
  const packageName = await readPackageName(packageRoot);

  return {
    packageRoot,
    ...(packageName === undefined ? {} : { packageName }),
    ...(configPath === undefined ? {} : { configPath }),
  };
};

const createExplicitContextDescriptor = (options: ExplicitContextOptions): ContextDescriptor => {
  const packageRoot = toWorkspacePath(options.workspaceRoot, options.packageRoot);
  const configPath =
    options.configPath === undefined
      ? undefined
      : toWorkspacePath(options.workspaceRoot, options.configPath);
  const identity = [options.producer, packageRoot, configPath ?? ''].join('\u0000');

  return {
    contextId: `ctx_${digest(identity).slice(0, 24)}`,
    packageRoot,
    product: 'development',
    ...(options.packageName === undefined ? {} : { packageName: options.packageName }),
    ...(configPath === undefined ? {} : { configPath }),
    environment: options.producer === 'rslint' ? 'lint' : 'test',
  };
};

const createExplicitRun = (options: ExplicitRunOptions): ContextRunManifest => ({
  schemaVersion: contextStoreSchemaVersion,
  runId: options.createRunId?.() ?? `run_${Date.now()}_${randomUUID()}`,
  producer: options.producer,
  command: options.command,
  startedAt: (options.now?.() ?? new Date()).toISOString(),
  contexts: [options.context],
});

const recordContextInputFiles = async (
  workspaceRoot: string,
  filePaths: string[],
): Promise<ContextInputFile[]> =>
  Promise.all(
    filePaths.map(async (filePath) => {
      const relativePath = toWorkspacePath(workspaceRoot, filePath);
      return {
        path: relativePath,
        digest: digest(await readFile(path.resolve(workspaceRoot, relativePath))),
      };
    }),
  ).then((inputs) => inputs.sort((left, right) => left.path.localeCompare(right.path)));

const assessSnapshotFreshness = async (
  workspaceRoot: string,
  snapshot: ContextSnapshot,
): Promise<ContextFreshness> => {
  const source = snapshot.source;
  if (source?.virtualInputDigest !== undefined || source?.inputs === undefined) {
    return { state: 'unknown', changedPaths: [] };
  }

  const changedPaths = (
    await Promise.all(
      source.inputs.map(async (input) => {
        try {
          const currentDigest = digest(await readFile(path.resolve(workspaceRoot, input.path)));
          return currentDigest === input.digest ? undefined : input.path;
        } catch {
          return input.path;
        }
      }),
    )
  )
    .filter((changedPath): changedPath is string => changedPath !== undefined)
    .sort((left, right) => left.localeCompare(right));

  if (changedPaths.length > 0) return { state: 'stale', changedPaths };
  return {
    state: source.inputCompleteness === 'complete' ? 'fresh' : 'partial',
    changedPaths: [],
  };
};

export {
  assessSnapshotFreshness,
  createExplicitContextDescriptor,
  createExplicitRun,
  recordContextInputFiles,
  resolveExplicitCaptureTarget,
  resolveInternalConfigPath,
};
export type { ExplicitContextOptions, ExplicitRunOptions };
