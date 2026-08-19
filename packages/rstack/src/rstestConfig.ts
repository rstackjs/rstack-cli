import type { ConfigParams } from '@rsbuild/core';
import type { RstestConfig, RstestConfigExport } from '@rstest/core';
import {
  applyRstackConfigModifiers,
  getRstackPluginRuntime,
  loadRstackConfig,
  type Configs,
  type LoadedRstackConfig,
} from './config.ts';

const resolveAutomaticExtends = async (
  loaded: LoadedRstackConfig,
  params: ConfigParams,
): Promise<RstestConfig['extends'] | undefined> => {
  // Prefer the app when both app and lib are defined. Merging both adapters can
  // introduce conflicting runtime, resolve, and source transform settings.
  const appConfig = loaded.configs.app;
  const runtime = await getRstackPluginRuntime(loaded);
  if (appConfig || runtime.hasConfigModifier('app')) {
    const { withRsbuildConfig } = await import(
      /* rspackChunkName: 'adapterRsbuild' */
      '@rstest/adapter-rsbuild'
    );
    const resolvedConfig =
      typeof appConfig === 'function' ? await appConfig(params) : appConfig;
    const config = await applyRstackConfigModifiers(
      loaded,
      'app',
      resolvedConfig === undefined ? {} : resolvedConfig,
    );

    return withRsbuildConfig({
      config,
    });
  }

  const libConfig = loaded.configs.lib;
  if (libConfig || runtime.hasConfigModifier('lib')) {
    const { withRslibConfig } = await import(
      /* rspackChunkName: 'adapterRslib' */
      '@rstest/adapter-rslib'
    );
    const resolvedConfig =
      typeof libConfig === 'function' ? await libConfig(params) : libConfig;
    const config = await applyRstackConfigModifiers(
      loaded,
      'lib',
      resolvedConfig === undefined ? {} : resolvedConfig,
    );

    return withRslibConfig({
      config,
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
  loaded: LoadedRstackConfig,
  testConfig: RstestConfig,
  params: ConfigParams,
) => {
  if ('extends' in testConfig) {
    return testConfig;
  }

  if (testConfig.projects === undefined) {
    const automaticExtends = await resolveAutomaticExtends(loaded, params);
    return injectExtends(testConfig, automaticExtends);
  }

  const shouldInjectProject = testConfig.projects.some(
    (project) => typeof project !== 'string' && !('extends' in project),
  );
  if (!shouldInjectProject) {
    return testConfig;
  }

  const automaticExtends = await resolveAutomaticExtends(loaded, params);

  return {
    ...testConfig,
    projects: testConfig.projects.map((project) =>
      typeof project === 'string'
        ? project
        : injectExtends(project, automaticExtends),
    ),
  };
};

const resolveRstestConfig = async (configs: Configs) => {
  const testConfig = configs.test;
  if (!testConfig) {
    return {};
  }
  if (typeof testConfig === 'function') {
    return testConfig();
  }
  return testConfig;
};

const loadRstestConfig = (async (params: ConfigParams) => {
  const loaded = await loadRstackConfig();
  const configWithAutomaticExtends = await extendsConfig(
    loaded,
    await resolveRstestConfig(loaded.configs),
    params,
  );
  return applyRstackConfigModifiers(loaded, 'test', configWithAutomaticExtends);
}) as RstestConfigExport;

export default loadRstestConfig;
