import * as yukuPlugin from '@prettier/plugin-yuku';
import type { Options as PrettierOptions, Plugin } from 'prettier';
import type { ResolvedFmtOptions } from './types.ts';

type PrettierPlugins = NonNullable<PrettierOptions['plugins']>;

const fmtOptionsPlugin = {
  options: {
    sortPackageJson: {
      category: 'Global',
      default: false,
      description: 'Sort package.json fields using sort-package-json.',
      type: 'boolean',
    },
  },
} satisfies Plugin;

const defaultFmtPlugins: PrettierPlugins = [yukuPlugin, fmtOptionsPlugin];

/** Prepends bundled plugins so project plugins can override their parsers. */
const getPrettierPlugins = async (options: ResolvedFmtOptions): Promise<PrettierPlugins> => {
  const plugins =
    options.sortPackageJson === true && /(^|[/\\])package\.json$/.test(options.filepath ?? '')
      ? [...defaultFmtPlugins, (await import('./sortPackageJsonPlugin.ts')).sortPackageJsonPlugin]
      : defaultFmtPlugins;

  return options.plugins?.length ? [...plugins, ...options.plugins] : plugins;
};

export { getPrettierPlugins };
