import { format, getFileInfo, type Options, type ParserOptions } from 'prettier';
import { expect, test } from 'rstack/test';
import { yukuPlugin } from '../../src/fmt/yukuPlugin.ts';

const formatWithYuku = (
  source: string,
  options: Options & { parser: 'yuku' | 'yuku-ts' },
): Promise<string> =>
  format(source, {
    plugins: [yukuPlugin],
    ...options,
    filepath: options.filepath ?? `example.${options.parser === 'yuku' ? 'js' : 'ts'}`,
  });

test('exposes the same JavaScript and TypeScript language mappings as the official plugin', async () => {
  expect(yukuPlugin.languages?.map(({ name, parsers }) => ({ name, parsers }))).toEqual([
    { name: 'JavaScript', parsers: ['yuku', 'yuku-ts'] },
    { name: 'JSX', parsers: ['yuku', 'yuku-ts'] },
    { name: 'TypeScript', parsers: ['yuku-ts'] },
    { name: 'TSX', parsers: ['yuku-ts'] },
  ]);

  await expect(
    Promise.all(
      ['js', 'jsx', 'ts', 'tsx'].map(async (extension) =>
        getFileInfo(`example.${extension}`, { plugins: [yukuPlugin] }),
      ),
    ),
  ).resolves.toEqual([
    { ignored: false, inferredParser: 'yuku' },
    { ignored: false, inferredParser: 'yuku' },
    { ignored: false, inferredParser: 'yuku-ts' },
    { ignored: false, inferredParser: 'yuku-ts' },
  ]);
});

test('parses JSX in JavaScript files', async () => {
  await expect(
    formatWithYuku('const view=<Component/>', {
      filepath: 'example.js',
      parser: 'yuku',
    }),
  ).resolves.toBe('const view = <Component />;\n');
});

test.each(['example.ts', 'example.mts', 'example.cts'])(
  'uses the TypeScript grammar for %s',
  async (filepath) => {
    await expect(
      formatWithYuku('const view=<Component/>', {
        filepath,
        parser: 'yuku-ts',
      }),
    ).rejects.toThrow();
  },
);

test.each(['example.d.ts', 'example.d.mts', 'example.d.cts'])(
  'uses the declaration grammar for %s',
  async (filepath) => {
    await expect(
      formatWithYuku('export function value() { return 1; }', {
        filepath,
        parser: 'yuku-ts',
      }),
    ).rejects.toThrow('An implementation cannot be declared in ambient contexts');
  },
);

test.each([
  {
    name: 'hashbangs and unicode locations',
    parser: 'yuku' as const,
    source: '#!/usr/bin/env node\n// 中文 😀\nconst 你好={值:"😀"}',
    expected: '#!/usr/bin/env node\n// 中文 😀\nconst 你好 = { 值: "😀" };\n',
  },
  {
    name: 'Closure-style type casts',
    parser: 'yuku' as const,
    source: '/** @type {Foo} */ (value).method()',
    expected: '/** @type {Foo} */ (value).method();\n',
  },
  {
    name: 'comments before semicolons',
    parser: 'yuku' as const,
    source: 'foo /* trailing */ ;',
    expected: 'foo; /* trailing */\n',
  },
  {
    name: 'adjacent multiline JSDoc comments',
    parser: 'yuku' as const,
    source: '/**\n * outer\n *//**\n * inner\n */\nfoo()',
    expected: '/**\n * outer\n *//**\n * inner\n */\nfoo();\n',
  },
  {
    name: 'right-nested logical expressions',
    parser: 'yuku' as const,
    source: 'const value = a || (b || c)',
    expected: 'const value = a || b || c;\n',
  },
  {
    name: 'parenthesized TypeScript types',
    parser: 'yuku-ts' as const,
    source: 'type Value = (((string | number)));',
    expected: 'type Value = string | number;\n',
  },
  {
    name: 'TypeScript template expressions',
    parser: 'yuku-ts' as const,
    source: 'const result = `value: ${foo satisfies string}`',
    expected: 'const result = `value: ${foo satisfies string}`;\n',
  },
  {
    name: 'TSX expressions',
    parser: 'yuku-ts' as const,
    filepath: 'example.tsx',
    source: 'const view=(<Component value={{foo:1}}>{(item)}</Component>)',
    expected: 'const view = <Component value={{ foo: 1 }}>{item}</Component>;\n',
  },
])('normalizes $name for the ESTree printer', async (fixture) => {
  await expect(
    formatWithYuku(fixture.source, {
      filepath: fixture.filepath,
      parser: fixture.parser,
    }),
  ).resolves.toBe(fixture.expected);
});

test('reuses Prettier options and pragma handling', async () => {
  await expect(
    formatWithYuku('/** @format */\nconst value={answer:"yes"}', {
      parser: 'yuku',
      requirePragma: true,
      singleQuote: true,
    }),
  ).resolves.toBe("/** @format */\nconst value = { answer: 'yes' };\n");

  await expect(
    formatWithYuku('/** @noformat */\nconst value={answer:"yes"}', {
      checkIgnorePragma: true,
      parser: 'yuku',
    }),
  ).resolves.toBe('/** @noformat */\nconst value={answer:"yes"}');
});

test.each([
  {
    source: '/** @prettier */\nconst value=1',
    hasPragma: true,
    hasIgnorePragma: false,
  },
  {
    source: '/* @format */\nconst value=1',
    hasPragma: true,
    hasIgnorePragma: false,
  },
  {
    source: '#!/usr/bin/env node\r\n/** @format */\r\nconst value=1',
    hasPragma: true,
    hasIgnorePragma: false,
  },
  {
    source: '/**\n * @prettier\n * @noformat\n */\nconst value=1',
    hasPragma: true,
    hasIgnorePragma: true,
  },
  {
    source: '/** @prettier @noformat */\nconst value=1',
    hasPragma: true,
    hasIgnorePragma: false,
  },
  {
    source: '/** text @prettier */\nconst value=1',
    hasPragma: false,
    hasIgnorePragma: false,
  },
  {
    source: '// before\n/** @prettier */\nconst value=1',
    hasPragma: false,
    hasIgnorePragma: false,
  },
])('matches Prettier pragma detection for $source', ({ source, hasPragma, hasIgnorePragma }) => {
  const parser = yukuPlugin.parsers?.yuku;
  if (!parser?.hasPragma || !parser.hasIgnorePragma) {
    throw new Error('The Yuku parser does not expose pragma handlers.');
  }

  expect(parser.hasPragma(source)).toBe(hasPragma);
  expect(parser.hasIgnorePragma(source)).toBe(hasIgnorePragma);
});

test('matches Prettier JavaScript location overrides', () => {
  const parser = yukuPlugin.parsers?.yuku;
  if (!parser) {
    throw new Error('The Yuku parser is not registered.');
  }

  expect(
    parser.locStart({
      type: 'ClassDeclaration',
      range: [10, 80],
      decorators: [{ type: 'Decorator', range: [2, 9] }],
    }),
  ).toBe(2);

  expect(
    parser.locStart({
      type: 'ExportNamedDeclaration',
      range: [10, 80],
      declaration: { decorators: [{ type: 'Decorator', range: [2, 9] }] },
    }),
  ).toBe(2);

  const endCases = [
    {
      expected: 44,
      node: {
        type: 'IfStatement',
        range: [0, 50],
        consequent: { type: 'BlockStatement', range: [3, 20] },
        alternate: { type: 'BlockStatement', range: [21, 44] },
      },
    },
    {
      expected: 45,
      node: {
        type: 'ForStatement',
        range: [0, 50],
        body: { type: 'BlockStatement', range: [20, 45] },
      },
    },
    { expected: 15, node: { type: 'BreakStatement', range: [10, 50] } },
    {
      expected: 21,
      node: {
        type: 'BreakStatement',
        range: [10, 50],
        label: { type: 'Identifier', range: [16, 21] },
      },
    },
    { expected: 18, node: { type: 'ContinueStatement', range: [10, 50] } },
    { expected: 18, node: { type: 'DebuggerStatement', range: [10, 50] } },
    {
      expected: 22,
      node: {
        type: 'VariableDeclaration',
        range: [0, 30],
        declarations: [
          { type: 'VariableDeclarator', range: [4, 10] },
          { type: 'VariableDeclarator', range: [12, 22] },
        ],
      },
    },
    {
      expected: 10,
      node: { type: 'ExpressionStatement', range: [0, 12], __contentEnd: 10 },
    },
  ];

  for (const { node, expected } of endCases) {
    expect(parser.locEnd(node)).toBe(expected);
  }
});

test('supports CommonJS source semantics for .cjs files', async () => {
  await expect(
    formatWithYuku('return require("example")', {
      filepath: 'example.cjs',
      parser: 'yuku',
    }),
  ).resolves.toBe('return require("example");\n');
});

test('matches the official hashbang AST shape', async () => {
  const parser = yukuPlugin.parsers?.yuku;
  if (!parser) {
    throw new Error('The Yuku parser is not registered.');
  }

  const options = { filepath: 'example.js' } as ParserOptions;
  const astWithoutHashbang = (await parser.parse('const value = 1', options)) as Record<
    string,
    unknown
  >;
  const astWithHashbang = (await parser.parse(
    '#!/usr/bin/env node\nconst value = 1',
    options,
  )) as Record<string, unknown>;

  expect(Object.hasOwn(astWithoutHashbang, 'hashbang')).toBe(true);
  expect(astWithoutHashbang.hashbang).toBeNull();
  expect(Object.hasOwn(astWithHashbang, 'hashbang')).toBe(false);
});

test('reports Yuku diagnostics with Prettier locations', async () => {
  try {
    await formatWithYuku('\n\nconst = 1', { parser: 'yuku-ts' });
    throw new Error('Expected Yuku to report a syntax error.');
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }

    const parseError = error as SyntaxError & {
      loc: {
        end: { column: number; line: number };
        start: { column: number; line: number };
      };
    };
    expect(Object.keys(parseError.loc)).toEqual(['start', 'end']);
    expect(parseError.loc).toEqual({
      start: { column: 7, line: 3 },
      end: { column: 8, line: 3 },
    });
  }
});
