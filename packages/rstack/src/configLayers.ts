import type {
  ConfigParams as AppConfigParams,
  RsbuildConfig,
} from '@rsbuild/core';
import type { ConfigParams as LibConfigParams, RslibConfig } from '@rslib/core';
import type { RslintConfig } from '@rslint/core';
import type { UserConfig as RspressConfig } from '@rspress/core';
import type { RstestConfig } from '@rstest/core';
import type { Configs } from './config.ts';
import type { FmtConfig } from './fmt/types.ts';
import type { StagedConfig } from './staged.ts';

/** Internal definitions, including the deferred lint factory created by define.lint. */
export type ConfigLayer = Readonly<Configs>;

/** Ordered from the lowest to the highest precedence; no tool merge rules here. */
export type ConfigLayers = readonly ConfigLayer[];

type ConfigValues = {
  app: RsbuildConfig;
  lib: RslibConfig;
  doc: RspressConfig;
  test: RstestConfig;
  lint: RslintConfig;
  fmt: FmtConfig;
  staged: StagedConfig;
};

type ConfigArgs<K extends keyof Configs> = K extends 'app'
  ? [params: AppConfigParams]
  : K extends 'lib'
    ? [params: LibConfigParams]
    : [];

/** Collect definitions without running factories or modifying the supplied layers. */
export const createConfigLayers = (
  project: ConfigLayer,
  inherited: ConfigLayers = [],
): ConfigLayers => [...inherited, project];

/**
 * Resolve only the requested tool, in layer order. Missing definitions contribute
 * nothing; defaults and merging belong to the tool adapter. Each call evaluates
 * its factories anew, without caching across native parameters or loads.
 */
export const resolveConfigLayers = async <K extends keyof Configs>(
  layers: ConfigLayers,
  kind: K,
  ...args: ConfigArgs<K>
): Promise<ConfigValues[K][]> => {
  const configs: ConfigValues[K][] = [];

  for (const layer of layers) {
    const definition = layer[kind];
    if (definition === undefined) {
      continue;
    }

    // A staged function generates tasks from file names; it is not a factory.
    if (kind !== 'staged' && typeof definition === 'function') {
      const factory = definition as (
        ...args: ConfigArgs<K>
      ) => ConfigValues[K] | Promise<ConfigValues[K]>;
      configs.push(await factory(...args));
    } else {
      configs.push(definition as ConfigValues[K]);
    }
  }

  return configs;
};
