import type { RsbuildConfigDefinition } from '@rsbuild/core';
import type { RstestConfigExport } from '@rstest/core';

export type ConfigType = 'app' | 'test';

type AppConfig = RsbuildConfigDefinition;
type TestConfig = RstestConfigExport;
type Config = AppConfig | TestConfig;

const registry = new Map<ConfigType, Config>();

export const resetRegistry = (): void => {
  registry.clear();
};

export const getConfig = (type: ConfigType): Config | undefined => registry.get(type);

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
