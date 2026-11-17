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
  // Markdown resolves fence languages by name and alias before file extension.
  // The published plugin omits these aliases and a separate JSX language entry.
  languages: [
    ...swc.languages!.map((language) => ({
      ...language,
      aliases:
        language.name === 'JavaScript'
          ? ['js', 'node']
          : language.name === 'TypeScript'
            ? ['ts']
            : ['typescriptreact'],
    })),
    { name: 'JSX', parsers: ['swc'], extensions: ['.jsx'] },
  ],
  parsers: {
    ...parsers,
    'swc-next': parsers.swc,
    'swc-next-ts': swcNextTypeScriptParser,
  },
};

export { swcNextPlugin };
