import * as swc from '@swc-next/formatter-prettier-plugin';
import type { Plugin } from 'prettier';

const parsers = swc.parsers!;
const swcNextTypeScriptParser: (typeof parsers)[string] = {
  ...parsers['swc-ts'],
  parse(text, options) {
    const parser = /\.tsx$/i.test(options.filepath ?? '')
      ? 'swc-tsx'
      : 'swc-ts';
    return parsers[parser].parse(text, options);
  },
};

// Keep the existing parser names available to configurations using them explicitly.
const swcNextPlugin: Plugin = {
  ...swc,
  parsers: {
    ...parsers,
    'swc-next': parsers.swc,
    'swc-next-ts': swcNextTypeScriptParser,
  },
};

export { swcNextPlugin };
