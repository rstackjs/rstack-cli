import type { RsbuildConfig } from '@rsbuild/core';
import type { RslibConfig } from '@rslib/core';
import type { RslintConfig } from '@rslint/core';
import type { UserConfig as RspressConfig } from '@rspress/core';
import type { RstestConfig } from '@rstest/core';
import type { FmtConfig } from './fmt/types.ts';
import type { StagedConfig } from './staged.ts';

export type RstackConfigMap = {
  app: RsbuildConfig;
  lib: RslibConfig;
  doc: RspressConfig;
  test: RstestConfig;
  lint: RslintConfig;
  fmt: FmtConfig;
  staged: StagedConfig;
};

export type RstackPluginContext = Readonly<{
  cwd: string;
  command: string;
  args: readonly string[];
  configFilePath: string | null;
}>;

export interface RstackLogger {
  debug(message?: unknown, ...args: unknown[]): void;
  info(message?: unknown, ...args: unknown[]): void;
  warn(message?: unknown, ...args: unknown[]): void;
  error(message?: unknown, ...args: unknown[]): void;
  success(message?: unknown, ...args: unknown[]): void;
}

export type RstackCommand = {
  name: string;
  handler: (args: readonly string[]) => void | Promise<void>;
};

export type RstackPluginAPI = {
  readonly context: RstackPluginContext;
  readonly logger: RstackLogger;

  addCommand: (command: RstackCommand) => void;

  modifyConfig: <K extends keyof RstackConfigMap>(
    kind: K,
    handler: (
      config: RstackConfigMap[K],
    ) => void | RstackConfigMap[K] | Promise<void | RstackConfigMap[K]>,
  ) => void;
};

export type RstackPlugin = {
  name: string;
  setup(api: RstackPluginAPI): void | Promise<void>;
};

export type RstackPlugins = Array<
  | RstackPlugin
  | false
  | null
  | undefined
  | Promise<RstackPlugin | false | null | undefined | RstackPlugins>
  | RstackPlugins
>;
