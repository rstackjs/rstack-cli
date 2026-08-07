import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { moduleResolve } from 'import-meta-resolve';
import type { Options as PrettierOptions } from 'prettier';
import { toPosixPath } from './pathHelpers.ts';
import type { FmtPluginSpecifier, ResolvedFmtOptions } from './types.ts';

type FmtPlugin = NonNullable<PrettierOptions['plugins']>[number];
type FmtPluginResolver = (options: ResolvedFmtOptions) => ResolvedFmtOptions;
type FingerprintResolver = (plugin: FmtPluginSpecifier) => Promise<string | undefined>;

const resolveModuleUrl = (specifier: string, parentUrl: URL): string =>
  moduleResolve(specifier, parentUrl).href;

const isFmtPluginSpecifier = (plugin: FmtPlugin): plugin is FmtPluginSpecifier =>
  typeof plugin === 'string' || plugin instanceof URL;

const getPackageRoot = (entryPath: string): string | undefined => {
  const marker = `${sep}node_modules${sep}`;
  const index = entryPath.lastIndexOf(marker);
  if (index === -1) {
    return undefined;
  }
  const start = index + marker.length;

  let end = entryPath.indexOf(sep, start);
  if (end === -1) {
    return undefined;
  }
  if (entryPath[start] === '@') {
    end = entryPath.indexOf(sep, end + 1);
    if (end === -1) {
      return undefined;
    }
  }

  return entryPath.slice(0, end);
};

const fingerprintPlugin = async (pluginUrl: string): Promise<string | undefined> => {
  try {
    const url = new URL(pluginUrl);
    if (url.protocol !== 'file:') {
      return undefined;
    }

    // Resolving symlinks keeps workspace and other local plugins out of the
    // package-version fast path when their implementation can change in place.
    const entryPath = await realpath(fileURLToPath(url));
    const packageRoot = getPackageRoot(entryPath);
    if (packageRoot === undefined) {
      return undefined;
    }

    const pkg: unknown = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    if (
      typeof pkg !== 'object' ||
      pkg === null ||
      !('name' in pkg) ||
      typeof pkg.name !== 'string' ||
      !('version' in pkg) ||
      typeof pkg.version !== 'string'
    ) {
      return undefined;
    }

    return JSON.stringify([
      'package',
      pkg.name,
      pkg.version,
      toPosixPath(relative(packageRoot, entryPath)),
    ]);
  } catch {
    return undefined;
  }
};

/** Creates a memoized identity resolver for installed package plugins. */
const createFingerprintResolver = (): FingerprintResolver => {
  const cache = new Map<string, Promise<string | undefined>>();

  return (plugin) => {
    const pluginUrl = plugin instanceof URL ? plugin.href : plugin;
    let fingerprint = cache.get(pluginUrl);
    if (fingerprint === undefined) {
      fingerprint = fingerprintPlugin(pluginUrl);
      cache.set(pluginUrl, fingerprint);
    }
    return fingerprint;
  };
};

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

export { createFingerprintResolver, createFmtPluginResolver };
export type { FingerprintResolver, FmtPluginResolver };
