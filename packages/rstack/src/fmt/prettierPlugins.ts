import type { Options as PrettierOptions, Plugin } from 'prettier';
import type { ResolvedFmtOptions } from './types.ts';
import { swcNextPlugin } from './swcNextPlugin.ts';

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

const defaultFmtPlugins: PrettierPlugins = [swcNextPlugin, fmtOptionsPlugin];

/** Prepends bundled plugins so project plugins can override their parsers. */
const getPrettierPlugins = async (
  options: ResolvedFmtOptions,
  filePath: string,
): Promise<PrettierPlugins> => {
  // An explicit native parser is also the escape hatch for bypassing SWC Next.
  const defaultPlugins =
    options.parser === 'babel' || options.parser === 'typescript'
      ? [fmtOptionsPlugin]
      : defaultFmtPlugins;
  const plugins =
    options.sortPackageJson === true && /(^|[/\\])package\.json$/.test(filePath)
      ? [
          ...defaultPlugins,
          (await import('./sortPackageJsonPlugin.ts')).sortPackageJsonPlugin,
        ]
      : defaultPlugins;

  return options.plugins?.length ? [...plugins, ...options.plugins] : plugins;
};

export { getPrettierPlugins };
