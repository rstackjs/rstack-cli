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

/** Uses Prettier for features and plugin ASTs the SWC formatter does not support. */
const getPrettierPlugins = async (
  options: ResolvedFmtOptions,
  filePath: string,
  source?: string,
): Promise<PrettierPlugins> => {
  const projectPlugins = await Promise.all(
    (options.plugins ?? []).map(async (plugin): Promise<Plugin> => {
      if (typeof plugin === 'string' || plugin instanceof URL) {
        const loaded = (await import(String(plugin))) as Plugin & {
          default?: Plugin;
        };
        return loaded.default ?? loaded;
      }
      return plugin;
    }),
  );
  // Parser wrappers such as Tailwind require Prettier's AST, not a prebuilt document.
  const hasJavaScriptPlugin = projectPlugins.some((plugin) =>
    ['babel', 'typescript', 'swc', 'swc-ts', 'swc-tsx'].some(
      (parser) => plugin.parsers?.[parser],
    ),
  );
  // Explicit SWC parsers retain the published plugin's behavior and validation.
  const isSwcParser = /^(?:swc|swc-ts|swc-tsx|swc-next|swc-next-ts)$/.test(
    typeof options.parser === 'string' ? options.parser : '',
  );
  const isSwcDefault =
    !options.parser &&
    /\.(?:[cm]?[jt]s|[jt]sx)$/i.test(filePath) &&
    !hasJavaScriptPlugin &&
    !options.requirePragma &&
    !options.insertPragma &&
    !options.checkIgnorePragma &&
    !options.rangeStart &&
    (options.rangeEnd === undefined || options.rangeEnd === Infinity) &&
    !options.experimentalTernaries &&
    options.experimentalOperatorPosition !== 'start' &&
    options.objectWrap !== 'collapse' &&
    // Template literals can contain embedded languages handled by Prettier.
    !(options.embeddedLanguageFormatting !== 'off' && source?.includes('`'));
  const defaultPlugins =
    isSwcParser || isSwcDefault ? defaultFmtPlugins : [fmtOptionsPlugin];
  const plugins =
    options.sortPackageJson === true && /(^|[/\\])package\.json$/.test(filePath)
      ? [
          ...defaultPlugins,
          (await import('./sortPackageJsonPlugin.ts')).sortPackageJsonPlugin,
        ]
      : defaultPlugins;

  return projectPlugins.length ? [...plugins, ...projectPlugins] : plugins;
};

export { getPrettierPlugins };
