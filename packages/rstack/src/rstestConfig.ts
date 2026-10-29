import { normalize } from 'node:path';
import type { ConfigParams } from '@rsbuild/core';
import {
  type RstestConfig,
  type RstestConfigExport,
  mergeRstestConfig,
} from '@rstest/core';
import { type LoadProjectConfig, PROJECT_LOADER } from '@rstest/core/api';
import { loadRstackConfig, type RstackConfigDefinitions } from './config.ts';
import { resolveConfigLayers } from './configLayers.ts';

const resolveAutomaticExtends = async (
  layers: readonly RstackConfigDefinitions[],
  params: ConfigParams,
  cwd?: string,
): Promise<RstestConfig['extends'] | undefined> => {
  // Prefer the app when both app and lib are defined. Merging both adapters can
  // introduce conflicting runtime, resolve, and source transform settings.
  if (layers.some((layer) => layer.app !== undefined)) {
    const { withRsbuildConfig } = await import(
      /* rspackChunkName: 'adapterRsbuild' */
      '@rstest/adapter-rsbuild'
    );
    const { resolveRsbuildConfig } = await import('./rsbuildConfig.ts');

    return withRsbuildConfig({
      config: await resolveRsbuildConfig(layers, params),
    });
  }

  if (layers.some((layer) => layer.lib !== undefined)) {
    const { withRslibConfig } = await import(
      /* rspackChunkName: 'adapterRslib' */
      '@rstest/adapter-rslib'
    );
    const { resolveRslibConfig } = await import('./rslibConfig.ts');

    return withRslibConfig({
      config: await resolveRslibConfig(layers, params),
      // The adapter reads the project's tsconfig for decorator detection. It
      // falls back to `process.cwd()`, so external projects need their own
      // directory here or they would inherit the root tsconfig.
      cwd,
    });
  }

  return undefined;
};

const injectExtends = <T extends RstestConfig>(
  config: T,
  automaticExtends: RstestConfig['extends'],
): T => {
  if (!automaticExtends || 'extends' in config) {
    return config;
  }

  return {
    ...config,
    extends: automaticExtends,
  };
};

const extendsConfig = async (
  layers: readonly RstackConfigDefinitions[],
  testConfig: RstestConfig,
  params: ConfigParams,
  cwd?: string,
) => {
  if ('extends' in testConfig) {
    return testConfig;
  }

  if (testConfig.projects === undefined) {
    const automaticExtends = await resolveAutomaticExtends(layers, params, cwd);
    return injectExtends(testConfig, automaticExtends);
  }

  const shouldInjectProject = testConfig.projects.some(
    (project) => typeof project !== 'string' && !('extends' in project),
  );
  if (!shouldInjectProject) {
    return testConfig;
  }

  const automaticExtends = await resolveAutomaticExtends(layers, params, cwd);

  return {
    ...testConfig,
    projects: testConfig.projects.map((project) =>
      typeof project === 'string'
        ? project
        : injectExtends(project, automaticExtends),
    ),
  };
};

export const mergeRstestConfigLayers = async (
  layers: readonly RstackConfigDefinitions[],
): Promise<RstestConfig> => {
  const configs = await resolveConfigLayers(layers, 'test');
  return configs.length > 1
    ? mergeRstestConfig(...configs)
    : (configs[0] ?? {});
};

export const resolveRstestConfig = async (
  layers: readonly RstackConfigDefinitions[],
  params: ConfigParams,
  cwd?: string,
): Promise<RstestConfig> => {
  const testConfig = await mergeRstestConfigLayers(layers);
  return extendsConfig(layers, testConfig, params, cwd);
};

// Rstest reads the host loader only from the root config and calls it for every
// directory or file a string `projects` entry expands to. Rstack does not load
// native tool configs anywhere else, so a project without an Rstack config
// becomes an empty project instead of falling back to `rstest.config.*`.
const createProjectLoader =
  (params: ConfigParams): LoadProjectConfig =>
  async ({ dirPath, filePath }) => {
    // `null` searches the project directory with the default config file names
    // instead of reusing the `rs --config` path that loads the root config.
    const loaded = await loadRstackConfig({
      cwd: dirPath,
      configFilePath: filePath ?? null,
    });
    if (loaded.filePath === null) {
      return null;
    }

    return {
      content: await resolveRstestConfig([loaded.configs], params, dirPath),
      // Rstest dedupes projects by this string. Directory and file entries can
      // reach the same file with different path separators, so normalize.
      filePath: normalize(loaded.filePath),
      dependencies: loaded.dependencies,
    };
  };

const loadRstestConfig = (async (params: ConfigParams) => {
  const { configs } = await loadRstackConfig();
  const config = await resolveRstestConfig([configs], params);
  return {
    ...config,
    [PROJECT_LOADER]: createProjectLoader(params),
  };
}) as RstestConfigExport;

export default loadRstestConfig;
