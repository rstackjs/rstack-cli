import * as prettierEstreePlugin from 'prettier/plugins/estree';
import type { Parser, ParserOptions, Plugin } from 'prettier';
import {
  langFromPath,
  parse as parseWithYuku,
  type Comment,
  type Diagnostic,
  type ParseOptions,
  type ParseResult,
  type SourceLang,
  type SourceType,
} from 'yuku-parser';

const AST_FORMAT = 'estree-yuku';
const JS_TS_FILE_REGEXP = /\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$/i;
const JSX_REGEXP = /^[^"'`]*<\/|^[^/]{2}.*\/>/m;
const SOURCE_TYPE_COMBINATIONS: SourceType[] = ['module', 'commonjs'];

type Range = [start: number, end: number];

type Locatable = {
  __contentEnd?: number;
  alternate?: Locatable | null;
  body?: Locatable;
  consequent?: Locatable;
  declaration?: { decorators?: Locatable[] };
  declarations?: Locatable[];
  decorators?: Locatable[];
  end?: number;
  label?: Locatable | null;
  range?: Range;
  start?: number;
  type?: string;
};

type AstNode = Locatable & {
  [key: string]: unknown;
  type: string;
};

type PrettierComment = Comment & {
  range?: Range;
};

type EstreePlugin = typeof prettierEstreePlugin & {
  options: NonNullable<Plugin['options']>;
};

const estreePlugin = prettierEstreePlugin as EstreePlugin;
const estreePrinter = estreePlugin.printers.estree;

const CONTENT_END_NODE_TYPES = new Set([
  'ExpressionStatement',
  'Directive',
  'ImportDeclaration',
  'ExportDefaultDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ReturnStatement',
  'ThrowStatement',
  'DoWhileStatement',
]);

/** Mirrors Prettier's JavaScript location helpers without loading its Babel plugin. */
const locStart = (node: Locatable): number => {
  const start = (node.range?.[0] ?? node.start) as number;
  const firstDecorator = (node.declaration?.decorators ?? node.decorators)?.[0];

  return firstDecorator ? Math.min(locStart(firstDecorator), start) : start;
};

const locEndWithFullText = (node: Locatable): number =>
  (node.range?.[1] ?? node.end) as number;

const locEnd = (node: Locatable): number => {
  switch (node.type) {
    case 'IfStatement':
      return locEnd((node.alternate ?? node.consequent) as Locatable);

    case 'ForInStatement':
    case 'ForOfStatement':
    case 'ForStatement':
    case 'LabeledStatement':
    case 'WithStatement':
    case 'WhileStatement':
      return locEnd(node.body as Locatable);

    case 'BreakStatement':
      return node.label ? locEnd(node.label) : locStart(node) + 'break'.length;

    case 'ContinueStatement':
      return node.label
        ? locEnd(node.label)
        : locStart(node) + 'continue'.length;

    case 'DebuggerStatement':
      return locStart(node) + 'debugger'.length;

    case 'VariableDeclaration':
      return locEnd(node.declarations?.at(-1) as Locatable);

    default:
      return CONTENT_END_NODE_TYPES.has(node.type ?? '')
        ? (node.__contentEnd ?? locEndWithFullText(node))
        : locEndWithFullText(node);
  }
};

const DOCBLOCK_REGEXP = /^\s*(\/\*\*?(.|\r?\n)*?\*\/)/;
const COMMENT_END_REGEXP = /\*\/$/;
const COMMENT_START_REGEXP = /^\/\*\*?/;
const DOCBLOCK_LINE_START_REGEXP = /(\r?\n|^) *\* ?/g;
const PRAGMA_REGEXP = /(?:^|\r?\n) *@(\S+) *([^\n\r]*)/g;
const FORMAT_PRAGMAS = new Set(['format', 'prettier']);
const FORMAT_IGNORE_PRAGMAS = new Set(['noformat', 'noprettier']);

/** Matches Prettier's leading JavaScript docblock pragma handling. */
const hasPragmaFrom = (originalText: string, pragmas: Set<string>): boolean => {
  let text = originalText;

  if (text.startsWith('#!')) {
    const lineEnd = text.indexOf('\n');
    text = text.slice((lineEnd === -1 ? text.length : lineEnd) + 1);
  }

  const docblock = (text.match(DOCBLOCK_REGEXP)?.[0] ?? '')
    .trimStart()
    .replace(COMMENT_START_REGEXP, '')
    .replace(COMMENT_END_REGEXP, '')
    .replaceAll(DOCBLOCK_LINE_START_REGEXP, '$1');

  for (const match of docblock.matchAll(PRAGMA_REGEXP)) {
    if (pragmas.has(match[1])) {
      return true;
    }
  }

  return false;
};

const hasPragma = (text: string): boolean =>
  hasPragmaFrom(text, FORMAT_PRAGMAS);
const hasIgnorePragma = (text: string): boolean =>
  hasPragmaFrom(text, FORMAT_IGNORE_PRAGMAS);

const getVisitorKeys = estreePrinter.getVisitorKeys as
  ((node: AstNode) => string[]) | undefined;

if (!getVisitorKeys) {
  throw new Error('The Prettier ESTree printer does not expose visitor keys.');
}

const isAstNode = (value: unknown): value is AstNode =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  typeof (value as { type?: unknown }).type === 'string';

const asAstNode = (value: unknown): AstNode => {
  if (!isAstNode(value)) {
    throw new TypeError('Expected a Yuku AST node.');
  }
  return value;
};

const withExtra = (
  node: AstNode,
  extra: Record<string, unknown>,
): Record<string, unknown> => ({
  ...(node.extra !== null && typeof node.extra === 'object'
    ? (node.extra as Record<string, unknown>)
    : undefined),
  ...extra,
});

const isIndentableBlockComment = (comment: PrettierComment): boolean => {
  if (comment.type !== 'Block' || !comment.value.includes('\n')) {
    return false;
  }

  for (let line of `*${comment.value}*`.split('\n')) {
    line = line.trimStart();
    if (!line.startsWith('*')) {
      return false;
    }
  }

  return true;
};

const mergeNestedJsdocComments = (comments: PrettierComment[]): void => {
  let followingComment: PrettierComment | undefined;

  for (let index = comments.length - 1; index >= 0; index--) {
    const comment = comments[index];

    if (
      followingComment &&
      locEnd(comment) === locStart(followingComment) &&
      isIndentableBlockComment(comment) &&
      isIndentableBlockComment(followingComment)
    ) {
      comments.splice(index + 1, 1);
      comment.value += `*//*${followingComment.value}`;
      comment.range = [locStart(comment), locEnd(followingComment)];
    }

    followingComment = comment;
  }
};

const stripComments = (
  originalText: string,
  comments: PrettierComment[],
): string => {
  if (comments.length === 0) {
    return originalText;
  }

  const chunks: string[] = [];
  let cursor = 0;

  // Yuku returns comments in source order, so mask each range while copying the source only once.
  for (const comment of comments) {
    const start = locStart(comment);
    const end = locEnd(comment);
    chunks.push(originalText.slice(cursor, start));
    chunks.push(originalText.slice(start, end).replace(/[^\n]/g, ' '));
    cursor = end;
  }

  chunks.push(originalText.slice(cursor));
  return chunks.join('');
};

const setContentEnd = (
  node: AstNode,
  originalText: string,
  getTextWithoutComments: () => string,
): void => {
  if (!CONTENT_END_NODE_TYPES.has(node.type)) {
    return;
  }

  let end = node.range?.[1] ?? node.end;
  if (end === undefined || originalText[end - 1] !== ';') {
    return;
  }

  end -= 1;
  const textWithoutComments = getTextWithoutComments();
  const textBeforeSemicolon = textWithoutComments.slice(locStart(node), end);
  const cleanedText = textBeforeSemicolon.trimEnd();
  node.__contentEnd = end - (textBeforeSemicolon.length - cleanedText.length);
};

const isTypeCastComment = (comment: PrettierComment): boolean =>
  comment.type === 'Block' &&
  comment.value.startsWith('*') &&
  /@(?:type|satisfies)\b/.test(comment.value);

/**
 * Returns the greatest value less than or equal to `target` from an ascending
 * array, or `undefined` when no such value exists.
 */
const findLastAtOrBefore = (
  sortedValues: number[],
  target: number,
): number | undefined => {
  let lower = 0;
  let upper = sortedValues.length;

  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (sortedValues[middle] <= target) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }

  return sortedValues[lower - 1];
};

type VisitOptions = {
  onEnter?: (node: AstNode) => AstNode | undefined;
  onLeave?: (node: AstNode) => AstNode | undefined;
};

const visitNode = (value: unknown, options: VisitOptions): unknown => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      value[index] = visitNode(value[index], options);
    }
    return value;
  }

  let node = asAstNode(value);

  if (options.onEnter) {
    const result = options.onEnter(node) ?? node;
    if (result !== node) {
      return visitNode(result, options);
    }
    node = result;
  }

  for (const key of getVisitorKeys(node)) {
    node[key] = visitNode(node[key], options);
  }

  return options.onLeave?.(node) ?? node;
};

const isUnbalancedLogicalTree = (node: AstNode): boolean => {
  if (node.type !== 'LogicalExpression' || !isAstNode(node.right)) {
    return false;
  }

  return (
    node.right.type === 'LogicalExpression' &&
    node.operator === node.right.operator
  );
};

const rebalanceLogicalTree = (node: AstNode): AstNode => {
  if (!isUnbalancedLogicalTree(node)) {
    return node;
  }

  const left = asAstNode(node.left);
  const right = asAstNode(node.right);
  const rightLeft = asAstNode(right.left);
  const rightRight = asAstNode(right.right);

  return rebalanceLogicalTree({
    type: 'LogicalExpression',
    operator: node.operator,
    left: rebalanceLogicalTree({
      type: 'LogicalExpression',
      operator: node.operator,
      left,
      right: rightLeft,
      range: [locStart(left), locEnd(rightLeft)],
    }),
    right: rightRight,
    range: [locStart(node), locEnd(node)],
  });
};

const postprocess = (
  ast: AstNode,
  comments: PrettierComment[],
  text: string,
  astType: 'yuku-js' | 'yuku-ts',
): AstNode => {
  mergeNestedJsdocComments(comments);

  if (isAstNode(ast.hashbang)) {
    comments.unshift(ast.hashbang as unknown as PrettierComment);
    delete ast.hashbang;
  }

  ast.comments = comments;
  ast.range = [0, text.length];

  let textWithoutComments: string | undefined;
  const getTextWithoutComments = (): string => {
    textWithoutComments ??= stripComments(text, comments);
    return textWithoutComments;
  };
  let typeCastCommentEnds: number[] | undefined;

  return visitNode(ast, {
    onEnter(node) {
      setContentEnd(node, text, getTextWithoutComments);

      switch (node.type) {
        case 'ParenthesizedExpression': {
          const expression = asAstNode(node.expression);
          const start = locStart(node);

          // Yuku comments are in source order, so these end offsets are sorted.
          typeCastCommentEnds ??= comments
            .filter(isTypeCastComment)
            .map((comment) => locEnd(comment));

          const previousCommentEnd = findLastAtOrBefore(
            typeCastCommentEnds,
            start,
          );
          const shouldKeepParentheses =
            previousCommentEnd !== undefined &&
            text.slice(previousCommentEnd, start).trim().length === 0;

          if (shouldKeepParentheses) {
            return undefined;
          }

          expression.extra = withExtra(expression, { parenthesized: true });
          return expression;
        }

        case 'TemplateLiteral': {
          const expressions = node.expressions as unknown[];
          const quasis = node.quasis as unknown[];
          if (expressions.length !== quasis.length - 1) {
            throw new Error('Malformed template literal.');
          }
          break;
        }

        case 'TemplateElement': {
          if (astType === 'yuku-ts') {
            const start = locStart(node) + 1;
            const end = locEnd(node) - (node.tail ? 1 : 2);
            node.range = [start, end];
          }
          break;
        }

        case 'TSParenthesizedType':
          return asAstNode(node.typeAnnotation);

        case 'TopicReference':
          ast.extra = withExtra(ast, { __isUsingHackPipeline: true });
          break;

        case 'TSUnionType':
        case 'TSIntersectionType': {
          const types = node.types as unknown[];
          if (types.length === 1) {
            return asAstNode(types[0]);
          }
          break;
        }
      }

      return undefined;
    },
    onLeave(node) {
      return isUnbalancedLogicalTree(node)
        ? rebalanceLogicalTree(node)
        : undefined;
    },
  }) as AstNode;
};

const indexToPosition = (
  text: string,
  index: number,
): { column: number; line: number } => {
  const lineBreakBefore = index === 0 ? -1 : text.lastIndexOf('\n', index - 1);
  let line = 1;

  for (let current = 0; current <= lineBreakBefore; current++) {
    if (text[current] === '\n') {
      line++;
    }
  }

  return {
    column: index - lineBreakBefore,
    line,
  };
};

const createParseError = (error: Diagnostic, text: string): SyntaxError => {
  const start = indexToPosition(text, error.start);
  const end = indexToPosition(text, error.end);

  return Object.assign(
    new SyntaxError(`${error.message} (${start.line}:${start.column})`),
    {
      cause: error,
      loc: { start, end },
    },
  );
};

const parseWithOptions = (text: string, options: ParseOptions): ParseResult => {
  const result = parseWithYuku(text, {
    preserveParens: true,
    semanticErrors: false,
    attachComments: false,
    ...options,
  });

  if (result.diagnostics.length > 0) {
    throw createParseError(result.diagnostics[0], text);
  }

  return result;
};

const getSourceType = (filepath: string): SourceType | undefined => {
  if (/\.(?:mjs|mts)$/i.test(filepath)) {
    return 'module';
  }

  if (/\.(?:cjs|cts)$/i.test(filepath)) {
    return 'commonjs';
  }

  return undefined;
};

const getLanguageCombinations = (
  text: string,
  filepath: string,
): SourceLang[] => {
  const normalizedPath = filepath.toLowerCase();

  if (JS_TS_FILE_REGEXP.test(normalizedPath)) {
    return [langFromPath(normalizedPath)];
  }

  // Embedded code from Vue or Svelte keeps the host file path, so detect JSX from its content.
  return JSX_REGEXP.test(text) ? ['tsx', 'ts', 'dts'] : ['ts', 'tsx', 'dts'];
};

const tryCombinations = (combinations: (() => ParseResult)[]): ParseResult => {
  let firstError: unknown;
  let hasError = false;

  for (const combination of combinations) {
    try {
      return combination();
    } catch (error) {
      if (!hasError) {
        firstError = error;
        hasError = true;
      }
    }
  }

  if (hasError) {
    throw firstError;
  }

  throw new Error('No Yuku parser combinations were provided.');
};

const parseJavaScript = (
  text: string,
  options: ParserOptions<AstNode>,
): AstNode => {
  const sourceType = getSourceType(options.filepath);
  const combinations = (
    sourceType ? [sourceType] : SOURCE_TYPE_COMBINATIONS
  ).map(
    (candidate) => () =>
      parseWithOptions(text, { sourceType: candidate, lang: 'jsx' }),
  );
  const { program, comments } = tryCombinations(combinations);

  return postprocess(program as unknown as AstNode, comments, text, 'yuku-js');
};

const parseTypeScript = (
  text: string,
  options: ParserOptions<AstNode>,
): AstNode => {
  const sourceType = getSourceType(options.filepath);
  const languages = getLanguageCombinations(text, options.filepath);
  const combinations = (
    sourceType ? [sourceType] : SOURCE_TYPE_COMBINATIONS
  ).flatMap((candidate) =>
    languages.map(
      (lang) => () => parseWithOptions(text, { sourceType: candidate, lang }),
    ),
  );
  const { program, comments } = tryCombinations(combinations);

  return postprocess(program as unknown as AstNode, comments, text, 'yuku-ts');
};

const createParser = (
  parse: (text: string, options: ParserOptions<AstNode>) => AstNode,
): Parser<AstNode> => ({
  astFormat: AST_FORMAT,
  hasIgnorePragma,
  hasPragma,
  locEnd,
  locStart,
  parse,
});

/** Match the AST root returned by Prettier's native Babel parser. */
const parseBabel = (text: string, options: ParserOptions<AstNode>): AstNode => {
  const program = parseJavaScript(text, options);
  const comments = program.comments;
  const start = locStart(program);
  const end = locEndWithFullText(program);

  // Babel stores comments on the File node rather than its Program child.
  delete program.comments;

  return {
    type: 'File',
    comments,
    end,
    errors: [],
    program,
    range: [start, end],
    start,
  };
};

const yukuParser = createParser(parseJavaScript);
const yukuBabelParser = createParser(parseBabel);
const yukuTypeScriptParser = createParser(parseTypeScript);

const yukuPlugin: Plugin = {
  options: estreePlugin.options,
  parsers: {
    // Prettier resolves parsers from the last plugin that provides the name.
    // Project plugins are loaded after this one, so parser wrappers take priority.
    babel: yukuBabelParser,
    typescript: yukuTypeScriptParser,
    yuku: yukuParser,
    'yuku-ts': yukuTypeScriptParser,
  },
  printers: {
    [AST_FORMAT]: estreePrinter,
  },
};

export { yukuPlugin };
