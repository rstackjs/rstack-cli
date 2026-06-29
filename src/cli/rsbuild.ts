import { createRsbuild, loadConfig as baseLoadConfig, type RsbuildInstance } from '@rsbuild/core';
import { ensureAbsolutePath } from '../helpers.js';
import type { RsbuildCommonOptions } from './types.js';

const loadConfig = async (root: string) => {
  const { content: config } = await baseLoadConfig({
    cwd: root,
  });
  return config;
};

export async function initRsbuild({
  options,
}: {
  options?: RsbuildCommonOptions;
}): Promise<RsbuildInstance | undefined> {
  const cwd = process.cwd();
  const root = options?.root ? ensureAbsolutePath(cwd, options.root) : cwd;

  const rsbuild = await createRsbuild({
    cwd: root,
    config: () => loadConfig(root),
  });

  return rsbuild;
}
