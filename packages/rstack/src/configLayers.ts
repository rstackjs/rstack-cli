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
