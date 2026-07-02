import type { RsbuildConfigDefinition } from '@rsbuild/core';
import type { RstestConfigExport } from '@rstest/core';

export type ConfigType = 'app' | 'test';

type Config = RsbuildConfigDefinition | RstestConfigExport;

const registry = new Map<ConfigType, Config>();

export function getConfig(type: 'app'): RsbuildConfigDefinition | undefined;
export function getConfig(type: 'test'): RstestConfigExport | undefined;
export function getConfig(type: ConfigType): Config | undefined {
  const result = registry.get(type);
  registry.clear();
  return result;
}

const setConfig = (type: ConfigType, config: Config): void => {
  if (registry.has(type)) {
    throw new Error(`The "${type}" config has already been defined.`);
  }
  registry.set(type, config);
};

type Define = {
  app: (config: RsbuildConfigDefinition) => void;
  test: (config: RstestConfigExport) => void;
};

export const define: Define = {
  app: (config) => setConfig('app', config),
  test: (config) => setConfig('test', config),
};
