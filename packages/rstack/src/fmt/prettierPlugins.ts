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

/** Selects SWC for JS/TS files and Markdown fences unless a project plugin overrides it. */
const getPrettierPlugins = async (
  options: ResolvedFmtOptions,
  filePath: string,
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
    !hasJavaScriptPlugin;
  // cspell:ignore mkdn mdwn mkdown
  const isMarkdown = options.parser
    ? typeof options.parser === 'string' &&
      /^(?:markdown|mdx|remark)$/.test(options.parser)
    : /\.(?:md|mdx|markdown|mdown|mkdn|mkd|mdwn|mkdown|ron)$/i.test(filePath);
  const isSwcEmbedded = isMarkdown && !hasJavaScriptPlugin;
  // Validate before Prettier can skip empty files or files without a pragma.
  // Unsupported SWC options must fail instead of silently selecting another parser.
  if (isSwcParser || isSwcDefault) {
    if (
      options.requirePragma ||
      options.insertPragma ||
      options.checkIgnorePragma
    ) {
      throw new Error('SWCFMT does not yet support pragma options');
    }
    if (
      (options.rangeStart ?? 0) > 0 ||
      (options.rangeEnd !== undefined && options.rangeEnd !== Infinity)
    ) {
      throw new Error('SWCFMT currently supports whole-file formatting only');
    }
    if (
      options.experimentalTernaries ||
      options.experimentalOperatorPosition === 'start' ||
      options.objectWrap === 'collapse'
    ) {
      throw new Error(
        'SWCFMT does not yet support the requested layout option',
      );
    }
  }
  const defaultPlugins =
    isSwcParser || isSwcDefault || isSwcEmbedded
      ? defaultFmtPlugins
      : [fmtOptionsPlugin];
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
