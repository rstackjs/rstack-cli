import {
  loadRstackConfig,
  type LoadedRstackConfig,
  type LoadRstackConfigOptions,
} from '../config.ts';

type ConfigState = {
  /**
   * Absolute config path from the global `--config` flag, resolved at parse
   * time so a later cwd (such as an LSP workspace root) cannot change it.
   */
  configPath?: string;
};

declare global {
  // rslint-disable-next-line no-var
  var __rstackCliState: ConfigState | undefined;
}

export const getConfigState = (): ConfigState => {
  // The CLI and internal tool configs may be loaded as separate module instances.
  return (globalThis.__rstackCliState ??= {});
};

/** Passes `--config` to Rslint's JS plugin workers, which run in a fresh realm. */
export const CLI_CONFIG_PATH_ENV = 'RSTACK_CLI_CONFIG_PATH';

/** Loads a root tool config using the CLI path unless explicitly overridden. */
export const loadCliRstackConfig = (
  options: LoadRstackConfigOptions = {},
): Promise<LoadedRstackConfig> =>
  loadRstackConfig({
    ...options,
    configFilePath: options.configFilePath ?? getConfigState().configPath,
  });
