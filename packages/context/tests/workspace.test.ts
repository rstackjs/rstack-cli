import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@rstest/core';
import { resolveContextWorkspace } from '../src/workspace.ts';

const withTempDirectory = async (callback: (rootPath: string) => Promise<void>): Promise<void> => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-workspace-'));

  try {
    await callback(rootPath);
  } finally {
    await rm(rootPath, { force: true, recursive: true });
  }
};

test('resolves a package from its config path without using process cwd', async () => {
  await withTempDirectory(async (workspaceRoot) => {
    const packageRoot = path.join(workspaceRoot, 'packages', 'library');
    const configPath = path.join(packageRoot, 'rslib.config.ts');
    await mkdir(path.join(workspaceRoot, '.git'));
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      path.join(workspaceRoot, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    await writeFile(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({ name: '@repo/library' }),
    );
    await writeFile(configPath, 'export default {};\n');

    await expect(resolveContextWorkspace(configPath)).resolves.toEqual({
      workspaceRoot,
      packageRoot,
      packageName: '@repo/library',
    });
  });
});

test('falls back to a standalone package root', async () => {
  await withTempDirectory(async (packageRoot) => {
    const configPath = path.join(packageRoot, 'rsbuild.config.ts');
    await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'standalone' }));
    await writeFile(configPath, 'export default {};\n');

    await expect(resolveContextWorkspace(configPath)).resolves.toEqual({
      workspaceRoot: packageRoot,
      packageRoot,
      packageName: 'standalone',
    });
  });
});

test('uses the checkout root when a nested package has no workspace manifest', async () => {
  await withTempDirectory(async (workspaceRoot) => {
    const packageRoot = path.join(workspaceRoot, 'packages', 'library');
    await mkdir(path.join(workspaceRoot, '.git'));
    await mkdir(packageRoot, { recursive: true });
    await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'library' }));

    await expect(resolveContextWorkspace(packageRoot)).resolves.toEqual({
      workspaceRoot,
      packageRoot,
      packageName: 'library',
    });
  });
});

test('stops workspace discovery at the nearest checkout root', async () => {
  await withTempDirectory(async (ancestorWorkspaceRoot) => {
    const checkoutRoot = path.join(ancestorWorkspaceRoot, 'checkouts', 'project');
    const packageRoot = path.join(checkoutRoot, 'packages', 'library');
    await mkdir(path.join(checkoutRoot, '.git'), { recursive: true });
    await mkdir(packageRoot, { recursive: true });
    await writeFile(path.join(ancestorWorkspaceRoot, 'pnpm-workspace.yaml'), 'packages: []\n');
    await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'library' }));

    await expect(resolveContextWorkspace(packageRoot)).resolves.toEqual({
      workspaceRoot: checkoutRoot,
      packageRoot,
      packageName: 'library',
    });
  });
});

test('uses the start directory when no workspace markers exist', async () => {
  await withTempDirectory(async (rootPath) => {
    const sourceDirectory = path.join(rootPath, 'nested');
    const configPath = path.join(sourceDirectory, 'rspack.config.js');
    await mkdir(sourceDirectory);
    await writeFile(configPath, 'export default {};\n');

    await expect(resolveContextWorkspace(configPath)).resolves.toEqual({
      workspaceRoot: sourceDirectory,
      packageRoot: sourceDirectory,
    });
  });
});
