import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

type ResolvedContextWorkspace = {
  workspaceRoot: string;
  packageRoot: string;
  packageName?: string;
};

type PackageMetadata = {
  exists: boolean;
  isWorkspace: boolean;
  name?: string;
};

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

const readPackageMetadata = async (directoryPath: string): Promise<PackageMetadata> => {
  try {
    const value = JSON.parse(await readFile(path.join(directoryPath, 'package.json'), 'utf8')) as {
      name?: unknown;
      workspaces?: unknown;
    };

    return {
      exists: true,
      isWorkspace:
        Array.isArray(value.workspaces) ||
        (typeof value.workspaces === 'object' && value.workspaces !== null),
      ...(typeof value.name === 'string' ? { name: value.name } : {}),
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { exists: true, isWorkspace: false };
    }
    return { exists: false, isWorkspace: false };
  }
};

const hasPnpmWorkspaceManifest = async (directoryPath: string): Promise<boolean> =>
  (await pathExists(path.join(directoryPath, 'pnpm-workspace.yaml'))) ||
  (await pathExists(path.join(directoryPath, 'pnpm-workspace.yml')));

const resolveContextWorkspace = async (startPath: string): Promise<ResolvedContextWorkspace> => {
  const canonicalStartPath = await realpath(startPath);
  const startStats = await stat(canonicalStartPath);
  const startDirectory = startStats.isDirectory()
    ? canonicalStartPath
    : path.dirname(canonicalStartPath);
  let currentPath = startDirectory;
  let packageRoot: string | undefined;
  let packageName: string | undefined;
  let workspaceRoot: string | undefined;
  let checkoutRoot: string | undefined;

  while (true) {
    const packageMetadata = await readPackageMetadata(currentPath);
    if (packageRoot === undefined && packageMetadata.exists) {
      packageRoot = currentPath;
      packageName = packageMetadata.name;
    }
    if (
      workspaceRoot === undefined &&
      (packageMetadata.isWorkspace || (await hasPnpmWorkspaceManifest(currentPath)))
    ) {
      workspaceRoot = currentPath;
    }
    if (checkoutRoot === undefined && (await pathExists(path.join(currentPath, '.git')))) {
      checkoutRoot = currentPath;
      break;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }

  const resolvedWorkspaceRoot = workspaceRoot ?? checkoutRoot ?? packageRoot ?? startDirectory;
  return {
    workspaceRoot: resolvedWorkspaceRoot,
    packageRoot: packageRoot ?? resolvedWorkspaceRoot,
    ...(packageName === undefined ? {} : { packageName }),
  };
};

export { resolveContextWorkspace };
export type { ResolvedContextWorkspace };
