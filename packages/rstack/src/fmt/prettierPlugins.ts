import * as yukuPlugin from '@prettier/plugin-yuku';
import type { Options as PrettierOptions } from 'prettier';

type PrettierPlugins = NonNullable<PrettierOptions['plugins']>;

const defaultFmtPlugins: PrettierPlugins = [yukuPlugin];

/** Prepends Yuku so project plugins can override the default parser. */
const getPrettierPlugins = (plugins: PrettierOptions['plugins']): PrettierPlugins =>
  plugins?.length ? [...defaultFmtPlugins, ...plugins] : defaultFmtPlugins;

export { getPrettierPlugins };
