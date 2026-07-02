import type { RsbuildConfigDefinition } from '@rsbuild/core';
import type { RstestConfigExport } from '@rstest/core';

export type ConfigType = 'app' | 'test';

type Config = RsbuildConfigDefinition | RstestConfigExport;

const registry = new Map<ConfigType, Config>();

export function getConfig(type: 'app'): RsbuildConfigDefinition | undefined;
export function getConfig(type: 'test'): RstestConfigExport | undefined;
export function getConfig(type: ConfigType): Config | undefined {
  const result = registry.get(type);
  return result;
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
   * Defines the Rstest config for tests.
   *
   * This config is used by the `rs test` command. 
   * 
   * If `define.app` is also used, Rstest automatically extends the app config unless
   * `extends` is set explicitly.
   */
  test: (config: RstestConfigExport) => void;
};

export const define: Define = {
  app: (config) => setConfig('app', config),
  test: (config) => setConfig('test', config),
};
