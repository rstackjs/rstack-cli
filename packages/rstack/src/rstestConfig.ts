import type { ConfigParams } from '@rsbuild/core';
import type { RstestConfig, RstestConfigExport } from '@rstest/core';
import { getConfig, clearConfig, loadRstackConfig } from './config.js';

const extendsConfig = async (testConfig: RstestConfig, params: ConfigParams) => {
  if ('extends' in testConfig) {
    return testConfig;
  }

  const appConfig = getConfig('app');
  if (appConfig) {
    const { toRstestConfig } = await import(
      /* rspackChunkName: 'adapterRsbuild' */
      '@rstest/adapter-rsbuild'
    );
    const rsbuildConfig = typeof appConfig === 'function' ? await appConfig(params) : appConfig;

    testConfig.extends = toRstestConfig({
      rsbuildConfig,
    });
  }

  return testConfig;
};

const resolveRstestConfig = async () => {
  const testConfig = getConfig('test');
  if (!testConfig) {
    return {};
  }
  if (typeof testConfig === 'function') {
    return testConfig();
  }
  return testConfig;
};

const loadRstestConfig = (async (params: ConfigParams) => {
  await loadRstackConfig();
  const testConfig = await resolveRstestConfig();
  const finalConfig = extendsConfig(testConfig, params);

  clearConfig();
  return finalConfig;
}) as RstestConfigExport;

export default loadRstestConfig;
