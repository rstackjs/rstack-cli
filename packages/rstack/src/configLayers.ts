import type {
  ConfigParams as AppConfigParams,
  RsbuildConfig,
} from '@rsbuild/core';
import type { ConfigParams as LibConfigParams, RslibConfig } from '@rslib/core';
import type { RslintConfig } from '@rslint/core';
import type { UserConfig as RspressConfig } from '@rspress/core';
import type { RstestConfig } from '@rstest/core';
import {
  type Configs,
  type RstackConfig,
  normalizeRstackConfig,
} from './config.ts';
import type { FmtConfig } from './fmt/types.ts';
import type { StagedConfig } from './staged.ts';

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

/** Expand inherited configs before their children, preserving every occurrence. */
export const flattenConfigLayers = (
  configs: readonly RstackConfig[],
): Configs[] => {
  const layers: Configs[] = [];
  const ancestors = new Map<RstackConfig, string>();

  const visit = (config: RstackConfig, path: string): void => {
    const ancestorPath = ancestors.get(config);
    if (ancestorPath !== undefined) {
      throw new Error(
        `Circular config inheritance at ${path}: references ${ancestorPath}.`,
      );
    }

    ancestors.set(config, path);
    config.extends?.forEach((inherited, index) => {
      visit(inherited, `${path}.extends[${index}]`);
    });
    layers.push(normalizeRstackConfig(config));
    ancestors.delete(config);
  };

  configs.forEach((config, index) => visit(config, `extends[${index}]`));
  return layers;
};

/**
 * Resolve one tool from ordered, normalized config layers. Lint factories are
 * already wrapped by define.lint. This function does not merge the results.
 */
export const resolveConfigLayers = async <K extends keyof Configs>(
  layers: readonly Configs[],
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

export const resolveRslintConfig = async (
  layers: readonly Configs[],
): Promise<RslintConfig | undefined> => {
  const configs = await resolveConfigLayers(layers, 'lint');
  return configs.length > 1 ? configs.flat() : configs[0];
};

export const resolveStagedConfig = async (
  layers: readonly Configs[],
): Promise<StagedConfig | undefined> => {
  const configs = await resolveConfigLayers(layers, 'staged');
  if (configs.length <= 1) {
    return configs[0];
  }

  // Top-level task generators replace the whole config rather than glob keys.
  return configs.reduce((merged, config) =>
    typeof merged === 'function' || typeof config === 'function'
      ? config
      : { ...merged, ...config },
  );
};
