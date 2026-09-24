import type { ConfigParams } from '@rsbuild/core';
import {
  type RstestConfig,
  type RstestConfigExport,
  mergeRstestConfig,
} from '@rstest/core';
import { loadRstackConfig, type Configs } from './config.ts';
import { resolveConfigLayers } from './configLayers.ts';

const resolveAutomaticExtends = async (
  layers: readonly Configs[],
  params: ConfigParams,
): Promise<RstestConfig['extends'] | undefined> => {
  // Prefer the app when both app and lib are defined. Merging both adapters can
  // introduce conflicting runtime, resolve, and source transform settings.
  if (layers.some((layer) => layer.app !== undefined)) {
    const [{ withRsbuildConfig }, { resolveRsbuildConfig }] = await Promise.all(
      [
        import(
          /* rspackChunkName: 'adapterRsbuild' */
          '@rstest/adapter-rsbuild'
        ),
        import('./rsbuildConfig.ts'),
      ],
    );

    return withRsbuildConfig({
      config: await resolveRsbuildConfig(layers, params),
    });
  }

  if (layers.some((layer) => layer.lib !== undefined)) {
    const [{ withRslibConfig }, { resolveRslibConfig }] = await Promise.all([
      import(
        /* rspackChunkName: 'adapterRslib' */
        '@rstest/adapter-rslib'
      ),
      import('./rslibConfig.ts'),
    ]);

    return withRslibConfig({
      config: await resolveRslibConfig(layers, params),
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
  layers: readonly Configs[],
  testConfig: RstestConfig,
  params: ConfigParams,
) => {
  if ('extends' in testConfig) {
    return testConfig;
  }

  if (testConfig.projects === undefined) {
    const automaticExtends = await resolveAutomaticExtends(layers, params);
    return injectExtends(testConfig, automaticExtends);
  }

  const shouldInjectProject = testConfig.projects.some(
    (project) => typeof project !== 'string' && !('extends' in project),
  );
  if (!shouldInjectProject) {
    return testConfig;
  }

  const automaticExtends = await resolveAutomaticExtends(layers, params);

  return {
    ...testConfig,
    projects: testConfig.projects.map((project) =>
      typeof project === 'string'
        ? project
        : injectExtends(project, automaticExtends),
    ),
  };
};

export const resolveRstestConfig = async (
  layers: readonly Configs[],
  params: ConfigParams,
): Promise<RstestConfig> => {
  const configs = await resolveConfigLayers(layers, 'test');
  const testConfig =
    configs.length > 1 ? mergeRstestConfig(...configs) : (configs[0] ?? {});
  return extendsConfig(layers, testConfig, params);
};

const loadRstestConfig = (async (params: ConfigParams) => {
  const { configs } = await loadRstackConfig();
  return resolveRstestConfig([configs], params);
}) as RstestConfigExport;

export default loadRstestConfig;
