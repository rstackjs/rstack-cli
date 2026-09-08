import {
  langFromPath,
  parseSync as parse,
  type ParserOptions,
  type ParseResult as SwcParseResult,
} from '@swc-next/parser';

export { langFromPath };
export type { Comment, Diagnostic } from '@swc-next/parser';
export type Lang = 'js' | 'jsx' | 'ts' | 'tsx' | 'dts';
export type SourceType = 'module' | 'commonjs';
export type ParseOptions = {
  lang: Lang;
  sourceType: SourceType;
  preserveParens: true;
  comments: 'flat';
};

// Keep the upstream untyped AST behind an unknown boundary.
export type ParseResult = Omit<SwcParseResult, 'program'> & {
  program: unknown;
};

export const parseSync = (source: string, options: ParseOptions): ParseResult =>
  parse(source, options as ParserOptions);
