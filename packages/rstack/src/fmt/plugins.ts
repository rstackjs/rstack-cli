import { isAbsolute, join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleResolve } from 'import-meta-resolve';
import type { Options as PrettierOptions } from 'prettier';
import type { ResolvedFmtConfig } from './types.ts';

type FmtPlugin = NonNullable<PrettierOptions['plugins']>[number];

const resolveModuleUrl = (specifier: string, parentUrl: URL): string =>
  moduleResolve(specifier, parentUrl).href;

const resolvePlugin = (plugin: FmtPlugin, rootPath: string, parentUrl: URL): FmtPlugin => {
  if (plugin instanceof URL) {
    return resolveModuleUrl(plugin.href, parentUrl);
  }
  if (typeof plugin !== 'string') {
    return plugin;
  }
  if (isAbsolute(plugin)) {
    return resolveModuleUrl(pathToFileURL(plugin).href, parentUrl);
  }
  if (URL.canParse(plugin)) {
    return resolveModuleUrl(plugin, parentUrl);
  }

  try {
    return resolveModuleUrl(pathToFileURL(resolvePath(rootPath, plugin)).href, parentUrl);
  } catch {
    return resolveModuleUrl(plugin, parentUrl);
  }
};

const resolveOptionsPlugins = (
  options: PrettierOptions,
  rootPath: string,
  parentUrl: URL,
): PrettierOptions => {
  const { plugins } = options;
  if (!plugins?.some((plugin) => typeof plugin === 'string' || plugin instanceof URL)) {
    return options;
  }

  const resolvedPlugins = plugins.map((plugin) => resolvePlugin(plugin, rootPath, parentUrl));

  return resolvedPlugins.every((plugin, index) => plugin === plugins[index])
    ? options
    : { ...options, plugins: resolvedPlugins };
};

/** Resolves plugin specifiers from the Rstack config root. */
const resolveFmtConfigPlugins = (config: ResolvedFmtConfig): ResolvedFmtConfig => {
  const { rootPath } = config;
  const parentUrl = pathToFileURL(join(rootPath, 'index.js'));
  const baseOptions = resolveOptionsPlugins(config.baseOptions, rootPath, parentUrl);
  let overrides = config.overrides;

  for (let index = 0; index < overrides.length; index++) {
    const override = overrides[index];
    if (!override.options) {
      continue;
    }

    const options = resolveOptionsPlugins(override.options, rootPath, parentUrl);
    if (options !== override.options) {
      if (overrides === config.overrides) {
        overrides = [...overrides];
      }
      overrides[index] = { ...override, options };
    }
  }

  return baseOptions === config.baseOptions && overrides === config.overrides
    ? config
    : { ...config, baseOptions, overrides };
};

export { resolveFmtConfigPlugins };
