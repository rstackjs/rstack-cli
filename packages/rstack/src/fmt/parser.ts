import { getFileInfo, type FileInfoOptions, type Options as PrettierOptions } from 'prettier';

type PrettierPlugins = NonNullable<PrettierOptions['plugins']>;

const fileInfoOptions = {
  ignorePath: [],
  resolveConfig: false,
  withNodeModules: true,
} satisfies FileInfoOptions;

/** Uses the configured parser or infers one without loading Prettier config. */
const resolveFmtParser = async (
  filePath: string,
  options: PrettierOptions,
  plugins: PrettierPlugins,
): Promise<PrettierOptions['parser'] | null> =>
  options.parser ??
  (
    await getFileInfo(filePath, {
      ...fileInfoOptions,
      plugins,
    })
  ).inferredParser;

export { resolveFmtParser };
