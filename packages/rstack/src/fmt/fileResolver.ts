import { createOptionsResolver } from './config.ts';
import type { FmtPluginResolver } from './plugins.ts';
import type { FmtFileRequest, ResolvedFmtConfig } from './types.ts';

type FmtFileResolver = (filePath: string) => Promise<FmtFileRequest>;

/** Applies per-file overrides and resolves configured plugin specifiers. */
const createFmtFileResolver = (config: ResolvedFmtConfig): FmtFileResolver => {
  const resolveOptions = createOptionsResolver(config);
  let pluginResolver: Promise<FmtPluginResolver> | undefined;

  return async (filePath) => {
    let options = resolveOptions(filePath);

    if (options.plugins?.length) {
      pluginResolver ??= import(
        /* rspackChunkName: 'fmtPlugins' */
        './plugins.ts'
      ).then(({ createPluginResolver }) => createPluginResolver(config.rootPath));
      options = (await pluginResolver)(options);
    }

    return { path: filePath, options };
  };
};

export { createFmtFileResolver };
export type { FmtFileResolver };
