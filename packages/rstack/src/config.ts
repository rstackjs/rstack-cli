import { AsyncLocalStorage } from 'node:async_hooks';
import { resolve } from 'node:path';
import { loadConfig } from '@rstackjs/load-config';
import { logger } from 'rslog';
import type { RsbuildConfigDefinition } from '@rsbuild/core';
import type { RslibConfigDefinition } from '@rslib/core';
import type { RslintConfig } from '@rslint/core';
import type { UserConfig, UserConfigAsyncFn } from '@rspress/core';
import type { RstestConfigExport } from '@rstest/core';
import type { ContextConfig } from '@rstackjs/context';
import type { FmtConfigDefinition } from './fmt/types.ts';
import { createContextPlugin } from './contextPlugin.ts';
import type { RstackConfigMap, RstackConfigModifierContextMap, RstackPlugins } from './plugin.ts';
import { createPluginRuntime, type RstackPluginRuntime } from './pluginRuntime.ts';
import type { StagedConfig } from './staged.ts';

export type RslintConfigDefinition = RslintConfig | (() => Promise<RslintConfig>);
export type RspressConfigDefinition = UserConfig | UserConfigAsyncFn;

type RslintConfigFactory = (
  lint: typeof import('@rslint/core'),
) => RslintConfig | Promise<RslintConfig>;

export type Configs = {
  app?: RsbuildConfigDefinition;
  lib?: RslibConfigDefinition;
  context?: ContextConfig;
  doc?: RspressConfigDefinition;
  test?: RstestConfigExport;
  lint?: RslintConfigDefinition;
  fmt?: FmtConfigDefinition;
  staged?: StagedConfig;
};

export type LoadedRstackConfig = {
  configs: Configs;
  plugins: RstackPlugins;
  filePath: string | null;
  dependencies: string[];
};

const loadedPluginRuntimes = new WeakMap<LoadedRstackConfig, Promise<RstackPluginRuntime>>();
const loadedConfigDirectories = new WeakMap<LoadedRstackConfig, string>();

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
  plugins: RstackPlugins;
  pluginsDefined: boolean;
  active: boolean;
};

export type RstackInvocation = {
  cwd: string;
  command: string;
  args: string[];
  configFilePath: string | null;
};

type ConfigState = {
  /**
   * Config file path from the global `--config` flag. Always absolute: the CLI
   * resolves it at parse time so it stays independent of later cwd choices
   * (`loadRstackConfig` may be called with an LSP workspace root as `cwd`).
   */
  configPath?: string;
  configRoot?: string;
  invocation?: RstackInvocation;
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
  // instances. Keep CLI invocation state in its own global state.
  if (!globalThis.__rstackCliState) {
    globalThis.__rstackCliState = {};
  }

  return globalThis.__rstackCliState;
};

let explicitConfigCaptureTail = Promise.resolve();

export const withRstackConfigTarget = async <T>(
  configRoot: string,
  configPath: string | undefined,
  action: () => Promise<T>,
): Promise<T> => {
  const previousCapture = explicitConfigCaptureTail;
  let releaseCapture!: () => void;
  explicitConfigCaptureTail = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  await previousCapture;

  const state = getConfigState();
  const previousConfigPath = state.configPath;
  const previousConfigRoot = state.configRoot;
  state.configPath = configPath;
  state.configRoot = configRoot;
  try {
    return await action();
  } finally {
    state.configPath = previousConfigPath;
    state.configRoot = previousConfigRoot;
    releaseCapture();
  }
};

export const getRstackPluginRuntime = (
  config: LoadedRstackConfig,
): Promise<RstackPluginRuntime> => {
  const existingRuntime = loadedPluginRuntimes.get(config);
  if (existingRuntime) {
    return existingRuntime;
  }

  const invocation = getConfigState().invocation;
  const cwd = invocation?.cwd ?? loadedConfigDirectories.get(config) ?? process.cwd();
  const runtime = createPluginRuntime({
    plugins: [config.plugins, createContextPlugin(config, cwd)],
    context: {
      cwd,
      command: invocation?.command ?? 'programmatic',
      args: invocation?.args ?? [],
      configFilePath: config.filePath,
    },
    logger,
  });
  loadedPluginRuntimes.set(config, runtime);
  return runtime;
};

export const applyRstackConfigModifiers = async <K extends keyof RstackConfigMap>(
  loaded: LoadedRstackConfig,
  kind: K,
  config: RstackConfigMap[K],
  context: RstackConfigModifierContextMap[K],
): Promise<RstackConfigMap[K]> =>
  (await getRstackPluginRuntime(loaded)).applyConfigModifiers(kind, config, context);
type Define = {
  /**
   * Registers plugins that extend the Rstack CLI.
   *
   * @see {@link https://rstack.rs/plugins | Rstack plugin guide}
   */
  plugins: (plugins: RstackPlugins) => void;
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
  /** Defines trusted passive build-context collection settings. */
  context: (config: ContextConfig) => void;
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
   * A config factory receives the exports from `rstack/lint`.
   *
   * @see {@link https://rstack.rs/config | Rstack configuration guide}
   */
  lint: (config: RslintConfig | RslintConfigFactory) => void;
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

const getActiveConfigSession = (type: string): ConfigSession => {
  const session = getConfigSessionStorage().getStore();

  if (!session?.active) {
    throw new Error(`The "${type}" config must be defined while loading an Rstack config.`);
  }

  return session;
};

const setConfig = <T extends keyof Configs>(type: T, config: Configs[T]): void => {
  const session = getActiveConfigSession(type);

  if (type in session.configs) {
    throw new Error(`The "${type}" config has already been defined.`);
  }
  session.configs[type] = config;
};

const setPlugins = (plugins: RstackPlugins): void => {
  const session = getActiveConfigSession('plugins');

  if (session.pluginsDefined) {
    throw new Error('The "plugins" config has already been defined.');
  }
  session.plugins = plugins;
  session.pluginsDefined = true;
};

export const define: Define = {
  plugins: setPlugins,
  app: (config) => setConfig('app', config),
  lib: (config) => setConfig('lib', config),
  context: (config) => setConfig('context', config),
  doc: (config) => setConfig('doc', config),
  test: (config) => setConfig('test', config),
  lint: (config) =>
    setConfig(
      'lint',
      typeof config === 'function' ? async () => config(await import('@rslint/core')) : config,
    ),
  fmt: (config) => setConfig('fmt', config),
  staged: (config) => setConfig('staged', config),
};

export const loadRstackConfig = async ({
  configFilePath,
  cwd,
}: LoadRstackConfigOptions = {}): Promise<LoadedRstackConfig> => {
  const state = getConfigState();
  const configPath = configFilePath ?? state.configPath;
  const configRoot = state.configRoot;
  const session: ConfigSession = {
    configs: {},
    plugins: [],
    pluginsDefined: false,
    active: true,
  };

  const loadedConfig = await getConfigSessionStorage().run(session, async () => {
    try {
      const { filePath, dependencies } = await loadConfig({
        loader: 'native',
        exportName: false,
        fresh: true,
        cwd: configRoot ?? cwd,
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

      if (state.invocation) {
        state.invocation.configFilePath = filePath;
      }

      const result = {
        configs: session.configs,
        plugins: session.plugins,
        filePath,
        dependencies,
      };
      loadedConfigDirectories.set(result, resolve(configRoot ?? cwd ?? process.cwd()));
      return result;
    } finally {
      session.active = false;
      session.configs = {};
      session.plugins = [];
      session.pluginsDefined = false;
    }
  });

  await getRstackPluginRuntime(loadedConfig);
  return loadedConfig;
};
