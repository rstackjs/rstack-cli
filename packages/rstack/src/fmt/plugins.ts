import { isAbsolute, join, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleResolve } from 'import-meta-resolve';
import type { Options as PrettierOptions } from 'prettier';
import type { FmtPluginSpecifier } from './types.ts';

type FmtPlugin = NonNullable<PrettierOptions['plugins']>[number];
type FmtPluginResolver = (options: PrettierOptions) => PrettierOptions;

const resolveModuleUrl = (specifier: string, parentUrl: URL): string =>
  moduleResolve(specifier, parentUrl).href;

const isFmtPluginSpecifier = (plugin: FmtPlugin): plugin is FmtPluginSpecifier =>
  typeof plugin === 'string' || plugin instanceof URL;

/** Creates a project-root resolver for plugins in final per-file options. */
const createFmtPluginResolver = (rootPath: string): FmtPluginResolver => {
  const parentUrl = pathToFileURL(join(rootPath, 'index.js'));
  const cache = new Map<string, string>();

  const resolvePlugin = (plugin: FmtPluginSpecifier): string => {
    const specifier = plugin instanceof URL ? plugin.href : plugin;
    const cached = cache.get(specifier);
    if (cached !== undefined) {
      return cached;
    }

    let resolved: string;
    if (isAbsolute(specifier)) {
      resolved = resolveModuleUrl(pathToFileURL(specifier).href, parentUrl);
    } else if (URL.canParse(specifier)) {
      resolved = resolveModuleUrl(specifier, parentUrl);
    } else {
      try {
        resolved = resolveModuleUrl(
          pathToFileURL(resolvePath(rootPath, specifier)).href,
          parentUrl,
        );
      } catch {
        resolved = resolveModuleUrl(specifier, parentUrl);
      }
    }

    cache.set(specifier, resolved);
    return resolved;
  };

  return (options) => {
    const { plugins } = options;
    if (!plugins?.length) {
      return options;
    }
    if (!plugins.every(isFmtPluginSpecifier)) {
      // Imported plugin objects are not planned for support.
      throw new TypeError(
        'Prettier plugin objects are not supported. Use a package name, path, or URL instead.',
      );
    }

    const resolvedPlugins = plugins.map(resolvePlugin);

    return resolvedPlugins.every((plugin, index) => plugin === plugins[index])
      ? options
      : { ...options, plugins: resolvedPlugins };
  };
};

export { createFmtPluginResolver };
export type { FmtPluginResolver };
