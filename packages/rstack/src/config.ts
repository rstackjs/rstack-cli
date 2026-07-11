import { loadConfig } from '@rstackjs/load-config';
import type { RsbuildConfigDefinition } from '@rsbuild/core';
import type { RslibConfigDefinition } from '@rslib/core';
import type { RslintConfig } from '@rslint/core';
import type { UserConfig, UserConfigAsyncFn } from '@rspress/core';
import type { RstestConfigExport } from '@rstest/core';
import type { StagedConfig } from './staged.js';

export type RslintConfigDefinition = RslintConfig | (() => Promise<RslintConfig>);
export type RspressConfigDefinition = UserConfig | UserConfigAsyncFn;

export type Configs = {
  app?: RsbuildConfigDefinition;
  lib?: RslibConfigDefinition;
  doc?: RspressConfigDefinition;
  test?: RstestConfigExport;
  lint?: RslintConfigDefinition;
  staged?: StagedConfig;
};

type ConfigState = {
  configs: Configs;
  configPath?: string;
};

declare global {
  // rslint-disable-next-line no-var
  var __rstackConfigState: ConfigState | undefined;
}

export const getConfigState = (): ConfigState => {
  // Rsbuild's fresh import loader can load this module more than once when it
  // imports the internal rstack config. Keep CLI state on globalThis so the
  // `--config` path set by the CLI is visible to the fresh-imported instance.
  if (!globalThis.__rstackConfigState) {
    globalThis.__rstackConfigState = {
      configs: {},
    };
  }

  return globalThis.__rstackConfigState;
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
   * Defines the Rspress config for documentation.
   *
   * This config is used by the `rs doc` command.
   */
  doc: (config: RspressConfigDefinition) => void;
  /**
   * Defines the Rstest config for tests.
   *
   * This config is used by the `rs test` command.
   *
   * Unless `extends` is set explicitly, Rstest automatically extends `define.app` or
   * falls back to `define.lib`. The app config takes precedence when both are defined.
   */
  test: (config: RstestConfigExport) => void;
  /**
   * Defines the Rslint config for linting.
   *
   * This config is used by the `rs lint` command.
   */
  lint: (config: RslintConfig | (() => Promise<RslintConfig>)) => void;
  /**
   * Defines the lint-staged config for staged files.
   *
   * This config is used by the `rs staged` command.
   */
  staged: (config: StagedConfig) => void;
};

const setConfig = <T extends keyof Configs>(type: T, config: Configs[T]): void => {
  const state = getConfigState();

  if (state.configs[type]) {
    throw new Error(`The "${type}" config has already been defined.`);
  }
  state.configs[type] = config;
};

export const define: Define = {
  app: (config) => setConfig('app', config),
  lib: (config) => setConfig('lib', config),
  doc: (config) => setConfig('doc', config),
  test: (config) => setConfig('test', config),
  lint: (config) => setConfig('lint', config),
  staged: (config) => setConfig('staged', config),
};

export const loadRstackConfig = async (): Promise<Configs> => {
  const state = getConfigState();
  state.configs = {};

  try {
    await loadConfig({
      loader: 'native',
      exportName: false,
      ...(state.configPath !== undefined
        ? { path: state.configPath }
        : {
            configFileNames: [
              'rstack.config.ts',
              'rstack.config.js',
              'rstack.config.mts',
              'rstack.config.mjs',
            ],
          }),
    });

    return state.configs;
  } finally {
    state.configs = {};
  }
};
