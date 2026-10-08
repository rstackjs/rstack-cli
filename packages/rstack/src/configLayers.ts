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
    if (config.extends?.length) {
      const ancestorPath = ancestors.get(config);
      if (ancestorPath !== undefined) {
        throw new Error(
          `Circular config inheritance at ${path}: references ${ancestorPath}.`,
        );
      }

      ancestors.set(config, path);
      config.extends.forEach((inherited, index) => {
        visit(inherited, `${path}.extends[${index}]`);
      });
      ancestors.delete(config);
    }
    layers.push(normalizeRstackConfig(config));
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

export const resolveFmtConfigLayers = async (
  layers: readonly Configs[],
): Promise<FmtConfig | undefined> => {
  const configs = await resolveConfigLayers(layers, 'fmt');
  return configs.length > 1
    ? (Object.assign({}, ...configs) as FmtConfig)
    : configs[0];
};

/** Compose effective definitions without executing any tool or task factories. */
export const composeConfigLayers = async (
  layers: readonly Configs[],
): Promise<Configs> => {
  if (layers.length <= 1) {
    return layers[0] ?? {};
  }

  const configs: Configs = {};
  for (const kind of [
    'app',
    'lib',
    'doc',
    'test',
    'lint',
    'fmt',
    'staged',
  ] as const) {
    const matchingLayers = layers.filter((layer) => layer[kind] !== undefined);
    if (matchingLayers.length === 0) {
      continue;
    }
    if (matchingLayers.length === 1) {
      Object.assign(configs, { [kind]: matchingLayers[0][kind] });
      continue;
    }

    switch (kind) {
      case 'app':
        configs.app = async (params) => {
          const { resolveRsbuildConfig } = await import('./rsbuildConfig.ts');
          return resolveRsbuildConfig(matchingLayers, params);
        };
        break;
      case 'lib':
        configs.lib = async (params) => {
          const { resolveRslibConfig } = await import('./rslibConfig.ts');
          return resolveRslibConfig(matchingLayers, params);
        };
        break;
      case 'doc':
        configs.doc = async () => {
          const { resolveRspressConfig } = await import('./rspressConfig.ts');
          return resolveRspressConfig(matchingLayers);
        };
        break;
      case 'test':
        configs.test = async () => {
          const { mergeRstestConfigLayers } = await import('./rstestConfig.ts');
          return mergeRstestConfigLayers(matchingLayers);
        };
        break;
      case 'lint':
        configs.lint = async () => (await resolveRslintConfig(matchingLayers))!;
        break;
      case 'fmt':
        configs.fmt = async () =>
          (await resolveFmtConfigLayers(matchingLayers))!;
        break;
      case 'staged':
        configs.staged = await resolveStagedConfig(matchingLayers);
        break;
    }
  }
  return configs;
};
