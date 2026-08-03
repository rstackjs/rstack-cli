import { getFileInfo, type FileInfoOptions, type Options as PrettierOptions } from 'prettier';
import { getPrettierPlugins } from './prettierPlugins.ts';

const fileInfoOptions = {
  ignorePath: [],
  resolveConfig: false,
  withNodeModules: true,
} satisfies FileInfoOptions;

/** Uses the configured parser or infers one without loading Prettier config. */
const resolveFmtParser = async (
  filePath: string,
  options: PrettierOptions,
): Promise<PrettierOptions['parser'] | null> =>
  options.parser ??
  (
    await getFileInfo(filePath, {
      ...fileInfoOptions,
      plugins: await getPrettierPlugins(options),
    })
  ).inferredParser;

export { resolveFmtParser };
