import { AsyncLocalStorage } from 'node:async_hooks';
import { loadConfig } from '@rstackjs/load-config';
import type { RsbuildConfigDefinition } from '@rsbuild/core';
import type { RslibConfigDefinition } from '@rslib/core';
import type { RslintConfig } from '@rslint/core';
import type { UserConfig, UserConfigAsyncFn } from '@rspress/core';
import type { RstestConfigExport } from '@rstest/core';
import type { FmtConfigDefinition } from './fmt/types.ts';
import type { StagedConfig } from './staged.ts';

export type RslintConfigDefinition = RslintConfig | (() => Promise<RslintConfig>);
export type RspressConfigDefinition = UserConfig | UserConfigAsyncFn;

export type Configs = {
  app?: RsbuildConfigDefinition;
  lib?: RslibConfigDefinition;
  doc?: RspressConfigDefinition;
  test?: RstestConfigExport;
  lint?: RslintConfigDefinition;
  fmt?: FmtConfigDefinition;
  staged?: StagedConfig;
};

export type LoadedRstackConfig = {
  configs: Configs;
  filePath: string | null;
  dependencies: string[];
};

export type LoadRstackConfigOptions = {
  /**
   * The path to the Rstack config file, can be a relative or absolute path.
   * A relative path is resolved from `cwd`.
   * If `configFilePath` is not provided, the config path set by the CLI is used.
   * If neither path is provided, the function will search for the config file in `cwd`.
   */
  configFilePath?: string;
  /**
   * The directory the config file is searched in and relative config paths are resolved from.
   * Defaults to the current working directory.
   */
  cwd?: string;
};

type ConfigSession = {
  configs: Configs;
  active: boolean;
};

type ConfigState = {
  /**
   * Config file path from the global `--config` flag. Always absolute: the CLI
   * resolves it at parse time so it stays independent of later cwd choices
   * (`loadRstackConfig` may be called with an LSP workspace root as `cwd`).
   */
  configPath?: string;
};

declare global {
  // rslint-disable-next-line no-var
  var __rstackConfigSessionStorage: AsyncLocalStorage<ConfigSession> | undefined;
  // rslint-disable-next-line no-var
  var __rstackCliState: ConfigState | undefined;
}

const getConfigSessionStorage = (): AsyncLocalStorage<ConfigSession> => {
  // Rsbuild's fresh import loader can load this module more than once when it
  // imports the internal Rstack config. Keep the storage on globalThis so
  // every module instance reads and writes the same active session.
  if (!globalThis.__rstackConfigSessionStorage) {
    globalThis.__rstackConfigSessionStorage = new AsyncLocalStorage<ConfigSession>();
  }

  return globalThis.__rstackConfigSessionStorage;
};

export const getConfigState = (): ConfigState => {
  // The CLI and its internal tool config can also be loaded as separate module
  // instances. Keep only the CLI config path in its own global state.
  if (!globalThis.__rstackCliState) {
    globalThis.__rstackCliState = {};
  }

  return globalThis.__rstackCliState;
};

type Define = {
  /**
   * Defines the Rsbuild config for the app.
   *
   * This config is used by the `rs dev`, `rs build`, and `rs preview` commands.
   *
   * @see {@link https://rstack.rs/config | Rstack configuration guide}
   */
  app: (config: RsbuildConfigDefinition) => void;
  /**
   * Defines the Rslib config for libraries.
   *
   * This config is used by the `rs lib` command.
   *
   * @see {@link https://rstack.rs/config | Rstack configuration guide}
   */
  lib: (config: RslibConfigDefinition) => void;
  /**
   * Defines the Rspress config for documentation.
   *
   * This config is used by the `rs doc` command.
   *
   * @see {@link https://rstack.rs/config | Rstack configuration guide}
   */
  doc: (config: RspressConfigDefinition) => void;
  /**
   * Defines the Rstest config for tests.
   *
   * This config is used by the `rs test` command.
   *
   * Unless `extends` is set explicitly, Rstest automatically extends `define.app` or
   * falls back to `define.lib`. For multi-project configs, this applies to every inline
   * project without an explicit `extends`. The app config takes precedence when both are defined.
   *
   * @see {@link https://rstack.rs/config | Rstack configuration guide}
   */
  test: (config: RstestConfigExport) => void;
  /**
   * Defines the Rslint config for linting.
   *
   * This config is used by the `rs lint` command.
   *
   * @see {@link https://rstack.rs/config | Rstack configuration guide}
   */
  lint: (config: RslintConfig | (() => Promise<RslintConfig>)) => void;
  /**
   * Defines the Prettier config for formatting.
   *
   * This config will be used by the `rs fmt` command.
   *
   * @see {@link https://rstack.rs/config | Rstack configuration guide}
   */
  fmt: (config: FmtConfigDefinition) => void;
  /**
   * Defines the lint-staged config for staged files.
   *
   * This config is used by the `rs staged` command.
   *
   * @see {@link https://rstack.rs/config | Rstack configuration guide}
   */
  staged: (config: StagedConfig) => void;
};

const setConfig = <T extends keyof Configs>(type: T, config: Configs[T]): void => {
  const session = getConfigSessionStorage().getStore();

  if (!session?.active) {
    throw new Error(`The "${type}" config must be defined while loading an Rstack config.`);
  }

  if (type in session.configs) {
    throw new Error(`The "${type}" config has already been defined.`);
  }
  session.configs[type] = config;
};

export const define: Define = {
  app: (config) => setConfig('app', config),
  lib: (config) => setConfig('lib', config),
  doc: (config) => setConfig('doc', config),
  test: (config) => setConfig('test', config),
  lint: (config) => setConfig('lint', config),
  fmt: (config) => setConfig('fmt', config),
  staged: (config) => setConfig('staged', config),
};

export const loadRstackConfig = async ({
  configFilePath,
  cwd,
}: LoadRstackConfigOptions = {}): Promise<LoadedRstackConfig> => {
  const state = getConfigState();
  const configPath = configFilePath ?? state.configPath;
  const session: ConfigSession = {
    configs: {},
    active: true,
  };

  return getConfigSessionStorage().run(session, async () => {
    try {
      const { filePath, dependencies } = await loadConfig({
        loader: 'native',
        exportName: false,
        fresh: true,
        cwd,
        ...(configPath !== undefined
          ? { path: configPath }
          : {
              configFileNames: [
                'rstack.config.ts',
                'rstack.config.js',
                'rstack.config.mts',
                'rstack.config.mjs',
              ],
            }),
      });

      return {
        configs: session.configs,
        filePath,
        dependencies,
      };
    } finally {
      session.active = false;
      session.configs = {};
    }
  });
};
