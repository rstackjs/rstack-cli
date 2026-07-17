import type { ConfigParams } from '@rsbuild/core';
import type { RstestConfig, RstestConfigExport } from '@rstest/core';
import { loadRstackConfig, type Configs } from './config.js';

const resolveAutomaticExtends = async (
  configs: Configs,
  params: ConfigParams,
): Promise<RstestConfig['extends'] | undefined> => {
  // Prefer the app when both app and lib are defined. Merging both adapters can
  // introduce conflicting runtime, resolve, and source transform settings.
  const appConfig = configs.app;
  if (appConfig) {
    const { withRsbuildConfig } = await import(
      /* rspackChunkName: 'adapterRsbuild' */
      '@rstest/adapter-rsbuild'
    );
    const config = typeof appConfig === 'function' ? await appConfig(params) : appConfig;

    return withRsbuildConfig({
      config,
    });
  }

  const libConfig = configs.lib;
  if (libConfig) {
    const { withRslibConfig } = await import(
      /* rspackChunkName: 'adapterRslib' */
      '@rstest/adapter-rslib'
    );
    const config = typeof libConfig === 'function' ? await libConfig(params) : libConfig;

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

const extendsConfig = async (configs: Configs, testConfig: RstestConfig, params: ConfigParams) => {
  if ('extends' in testConfig) {
    return testConfig;
  }

  if (testConfig.projects === undefined) {
    const automaticExtends = await resolveAutomaticExtends(configs, params);
    return injectExtends(testConfig, automaticExtends);
  }

  const shouldInjectProject = testConfig.projects.some(
    (project) => typeof project !== 'string' && !('extends' in project),
  );
  if (!shouldInjectProject) {
    return testConfig;
  }

  const automaticExtends = await resolveAutomaticExtends(configs, params);

  return {
    ...testConfig,
    projects: testConfig.projects.map((project) =>
      typeof project === 'string' ? project : injectExtends(project, automaticExtends),
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
  const { configs } = await loadRstackConfig();
  const testConfig = await resolveRstestConfig(configs);
  return extendsConfig(configs, testConfig, params);
}) as RstestConfigExport;

export default loadRstestConfig;
