import { loadConfig, type RsbuildConfigDefinition } from '@rsbuild/core';
import type { ConfigParams as RslibConfigParams, RslibConfig } from '@rslib/core';
import type { RstestConfigExport } from '@rstest/core';
import type { Configuration as StagedConfig } from 'lint-staged';

export type ConfigType = 'app' | 'lib' | 'test' | 'staged';

export type RslibConfigDefinition =
  | RslibConfig
  | ((params: RslibConfigParams) => RslibConfig | Promise<RslibConfig>);

type Config = RsbuildConfigDefinition | RslibConfigDefinition | RstestConfigExport | StagedConfig;

const registry = new Map<ConfigType, Config>();

export function getConfig(type: 'app'): RsbuildConfigDefinition | undefined;
export function getConfig(type: 'lib'): RslibConfigDefinition | undefined;
export function getConfig(type: 'test'): RstestConfigExport | undefined;
export function getConfig(type: 'staged'): StagedConfig | undefined;
export function getConfig(type: ConfigType): Config | undefined {
  return registry.get(type);
}

export const clearConfig = () => {
  registry.clear();
};

const setConfig = (type: ConfigType, config: Config): void => {
  if (registry.has(type)) {
    throw new Error(`The "${type}" config has already been defined.`);
  }
  registry.set(type, config);
};

type Define = {
  /**
   * Defines the Rsbuild config for the app.
   *
   * This config is used by the `rs dev`, `rs build`, and `rs preview` commands.
   */
  app: (config: RsbuildConfigDefinition) => void;
  /**
   * Defines the Rslib config for libraries.
   *
   * This config is used by the `rs lib` command.
   */
  lib: (config: RslibConfigDefinition) => void;
  /**
   * Defines the Rstest config for tests.
   *
   * This config is used by the `rs test` command.
   *
   * If `define.app` is also used, Rstest automatically extends the app config unless
   * `extends` is set explicitly.
   */
  test: (config: RstestConfigExport) => void;
  /**
   * Defines the lint-staged config for staged files.
   *
   * This config is used by the `rs staged` command.
   */
  staged: (config: StagedConfig) => void;
};

export const define: Define = {
  app: (config) => setConfig('app', config),
  lib: (config) => setConfig('lib', config),
  test: (config) => setConfig('test', config),
  staged: (config) => setConfig('staged', config),
};

export const loadRstackConfig = () => {
  return loadConfig({
    loader: 'native',
    exportName: false,
    configFileNames: [
      'rstack.config.ts',
      'rstack.config.js',
      'rstack.config.mts',
      'rstack.config.mjs',
      'rstack.config.cts',
      'rstack.config.cjs',
    ],
  });
};
