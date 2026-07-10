import type { ConfigParams } from '@rsbuild/core';
import type { RstestConfig, RstestConfigExport } from '@rstest/core';
import { loadRstackConfig, type Configs } from './config.js';

const extendsConfig = async (configs: Configs, testConfig: RstestConfig, params: ConfigParams) => {
  if ('extends' in testConfig) {
    return testConfig;
  }

  // Prefer the app when both app and lib are defined. Merging both adapters can
  // introduce conflicting runtime, resolve, and source transform settings.
  const appConfig = configs.app;
  if (appConfig) {
    const { withRsbuildConfig } = await import(
      /* rspackChunkName: 'adapterRsbuild' */
      '@rstest/adapter-rsbuild'
    );
    const config = typeof appConfig === 'function' ? await appConfig(params) : appConfig;

    return {
      ...testConfig,
      extends: withRsbuildConfig({
        config,
      }),
    };
  }

  const libConfig = configs.lib;
  if (libConfig) {
    const { withRslibConfig } = await import(
      /* rspackChunkName: 'adapterRslib' */
      '@rstest/adapter-rslib'
    );
    const config = typeof libConfig === 'function' ? await libConfig(params) : libConfig;

    return {
      ...testConfig,
      extends: withRslibConfig({
        config,
      }),
    };
  }

  return testConfig;
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
  const configs = await loadRstackConfig();
  const testConfig = await resolveRstestConfig(configs);
  return extendsConfig(configs, testConfig, params);
}) as RstestConfigExport;

export default loadRstestConfig;
