import { loadConfig, type RsbuildConfigDefinition } from '@rsbuild/core';
import type { RslibConfigDefinition } from '@rslib/core';
import type { defineConfig as defineRslintConfig } from '@rslint/core';
import type { RstestConfigExport } from '@rstest/core';

export type StagedTask = string | string[];

export type StagedConfig = Record<string, StagedTask>;

// TODO: import from `@rslib/core`
export type RslintConfig = Parameters<typeof defineRslintConfig>[0];

export type Configs = {
  app?: RsbuildConfigDefinition;
  lib?: RslibConfigDefinition;
  test?: RstestConfigExport;
  lint?: RslintConfig;
  staged?: StagedConfig;
};

let configs: Configs = {};

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
   * Defines the Rslint config for linting.
   *
   * This config is used by the `rs lint` command.
   */
  lint: (config: RslintConfig) => void;
  /**
   * Defines the lint-staged config for staged files.
   *
   * This config is used by the `rs staged` command.
   */
  staged: (config: StagedConfig) => void;
};

const setConfig = <T extends keyof Configs>(type: T, config: Configs[T]): void => {
  if (configs[type]) {
    throw new Error(`The "${type}" config has already been defined.`);
  }
  configs[type] = config;
};

export const define: Define = {
  app: (config) => setConfig('app', config),
  lib: (config) => setConfig('lib', config),
  test: (config) => setConfig('test', config),
  lint: (config) => setConfig('lint', config),
  staged: (config) => setConfig('staged', config),
};

export const loadRstackConfig = async (): Promise<Configs> => {
  await loadConfig({
    loader: 'native',
    exportName: false,
    configFileNames: [
      'rstack.config.ts',
      'rstack.config.js',
      'rstack.config.mts',
      'rstack.config.mjs',
    ],
  });

  const result = configs;
  configs = {};
  return result;
};
