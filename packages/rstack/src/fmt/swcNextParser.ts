import { decode, type DecodeResult } from '@swc-next/decoder';
import { loadNativeBinding } from '../native/index.ts';

export type { Comment, Diagnostic } from '@swc-next/decoder';
export type Lang = 'js' | 'jsx' | 'ts' | 'tsx' | 'dts';
export type SourceType = 'module' | 'commonjs';
export type ParseOptions = {
  lang: Lang;
  sourceType: SourceType;
  preserveParens: true;
  comments: 'flat';
};

export const langFromPath = (filePath: string): Lang => {
  if (/\.d\.(?:ts|mts|cts)$/i.test(filePath)) return 'dts';
  if (/\.tsx$/i.test(filePath)) return 'tsx';
  if (/\.(?:ts|mts|cts)$/i.test(filePath)) return 'ts';
  if (/\.jsx$/i.test(filePath)) return 'jsx';
  return 'js';
};

// Keep the upstream untyped AST behind an unknown boundary.
export type ParseResult = Omit<DecodeResult, 'program'> & { program: unknown };

export const parseSync = (
  source: string,
  options: ParseOptions,
): ParseResult => {
  // Resolve the generated loader only when formatting actually needs a parser.
  const buffer = loadNativeBinding().parseSwcNext(
    source,
    options.lang,
    options.sourceType,
  );
  return decode(buffer, source);
};
