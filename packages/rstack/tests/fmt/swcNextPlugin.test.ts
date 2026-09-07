import {
  format,
  getFileInfo,
  type Options,
  type ParserOptions,
} from 'prettier';
import { expect, test } from 'rstack/test';
import { getPrettierPlugins } from '../../src/fmt/prettierPlugins.ts';
import { swcNextPlugin } from '../../src/fmt/swcNextPlugin.ts';

const formatWithSwcNext = (
  source: string,
  options: Options & { parser: 'swc-next' | 'swc-next-ts' },
): Promise<string> =>
  format(source, {
    plugins: [swcNextPlugin],
    ...options,
    filepath:
      options.filepath ??
      `example.${options.parser === 'swc-next' ? 'js' : 'ts'}`,
  });

test('overrides the default JavaScript and TypeScript parsers', async () => {
  expect(swcNextPlugin.languages).toBeUndefined();
  expect(swcNextPlugin.parsers?.babel).not.toBe(
    swcNextPlugin.parsers?.['swc-next'],
  );
  expect(swcNextPlugin.parsers?.typescript).toBe(
    swcNextPlugin.parsers?.['swc-next-ts'],
  );

  await expect(
    Promise.all(
      ['js', 'jsx', 'ts', 'tsx'].map(async (extension) =>
        getFileInfo(`example.${extension}`, { plugins: [swcNextPlugin] }),
      ),
    ),
  ).resolves.toEqual([
    { ignored: false, inferredParser: 'babel' },
    { ignored: false, inferredParser: 'babel' },
    { ignored: false, inferredParser: 'typescript' },
    { ignored: false, inferredParser: 'typescript' },
  ]);
});

test('matches the native Babel AST root shape', async () => {
  const parser = swcNextPlugin.parsers?.babel;
  if (!parser) {
    throw new Error('The Babel-compatible SWC Next parser is not registered.');
  }

  const ast = (await parser.parse('// comment\nconst value = 1', {
    filepath: 'example.js',
  } as ParserOptions)) as Record<string, unknown>;
  const program = ast.program as Record<string, unknown>;

  expect(ast.type).toBe('File');
  expect(ast.comments).toHaveLength(1);
  expect(program.type).toBe('Program');
  expect(program.comments).toBeUndefined();
});

test.each(['babel', 'typescript'] as const)(
  'does not override an explicitly selected %s parser',
  async (parser) => {
    await expect(
      getPrettierPlugins(
        { parser },
        `example.${parser === 'babel' ? 'js' : 'ts'}`,
      ),
    ).resolves.not.toContain(swcNextPlugin);
  },
);

test('parses JSX in JavaScript files', async () => {
  await expect(
    formatWithSwcNext('const view=<Component/>', {
      filepath: 'example.js',
      parser: 'swc-next',
    }),
  ).resolves.toBe('const view = <Component />;\n');
});

test.each(['example.ts', 'example.mts', 'example.cts'])(
  'rejects JSX syntax in %s',
  async (filepath) => {
    await expect(
      formatWithSwcNext('const view=<Component/>', {
        filepath,
        parser: 'swc-next-ts',
      }),
    ).rejects.toThrow();
  },
);

test.each(['example.d.ts', 'example.d.mts', 'example.d.cts'])(
  'records the SWC Next 0.2.0 ambient implementation diagnostic gap in %s',
  async (filepath) => {
    // Unlike Yuku, SWC Next 0.2.0 leaves this ambient-context error to a type checker.
    await expect(
      formatWithSwcNext('export function value() { return 1; }', {
        filepath,
        parser: 'swc-next-ts',
      }),
    ).resolves.toBe('export function value() {\n  return 1;\n}\n');
  },
);

test.each([
  {
    name: 'hashbangs and unicode locations',
    parser: 'swc-next' as const,
    source: '#!/usr/bin/env node\n// 中文 😀\nconst 你好={值:"😀"}',
    expected: '#!/usr/bin/env node\n// 中文 😀\nconst 你好 = { 值: "😀" };\n',
  },
  {
    name: 'Closure-style type casts',
    parser: 'swc-next' as const,
    source: '/** @type {Foo} */ (value).method()',
    expected: '/** @type {Foo} */ (value).method();\n',
  },
  {
    name: 'comments before semicolons',
    parser: 'swc-next' as const,
    source: 'foo /* trailing */ ;',
    expected: 'foo; /* trailing */\n',
  },
  {
    name: 'adjacent multiline JSDoc comments',
    parser: 'swc-next' as const,
    source: '/**\n * outer\n *//**\n * inner\n */\nfoo()',
    expected: '/**\n * outer\n *//**\n * inner\n */\nfoo();\n',
  },
  {
    name: 'right-nested logical expressions',
    parser: 'swc-next' as const,
    source: 'const value = a || (b || c)',
    expected: 'const value = a || b || c;\n',
  },
  {
    name: 'parenthesized TypeScript types',
    parser: 'swc-next-ts' as const,
    source: 'type Value = (((string | number)));',
    expected: 'type Value = string | number;\n',
  },
  {
    name: 'TypeScript template expressions',
    parser: 'swc-next-ts' as const,
    source: 'const result = `value: ${foo satisfies string}`',
    expected: 'const result = `value: ${foo satisfies string}`;\n',
  },
  {
    name: 'TSX expressions',
    parser: 'swc-next-ts' as const,
    filepath: 'example.tsx',
    source: 'const view=(<Component value={{foo:1}}>{(item)}</Component>)',
    expected:
      'const view = <Component value={{ foo: 1 }}>{item}</Component>;\n',
  },
])('normalizes $name for the ESTree printer', async (fixture) => {
  await expect(
    formatWithSwcNext(fixture.source, {
      filepath: fixture.filepath,
      parser: fixture.parser,
    }),
  ).resolves.toBe(fixture.expected);
});

test('reuses Prettier options and pragma handling', async () => {
  await expect(
    formatWithSwcNext('/** @format */\nconst value={answer:"yes"}', {
      parser: 'swc-next',
      requirePragma: true,
      singleQuote: true,
    }),
  ).resolves.toBe("/** @format */\nconst value = { answer: 'yes' };\n");

  await expect(
    formatWithSwcNext('/** @noformat */\nconst value={answer:"yes"}', {
      checkIgnorePragma: true,
      parser: 'swc-next',
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
])(
  'matches Prettier pragma detection for $source',
  ({ source, hasPragma, hasIgnorePragma }) => {
    const parser = swcNextPlugin.parsers?.['swc-next'];
    if (!parser?.hasPragma || !parser.hasIgnorePragma) {
      throw new Error('The SWC Next parser does not expose pragma handlers.');
    }

    expect(parser.hasPragma(source)).toBe(hasPragma);
    expect(parser.hasIgnorePragma(source)).toBe(hasIgnorePragma);
  },
);

test('matches Prettier JavaScript location overrides', () => {
  const parser = swcNextPlugin.parsers?.['swc-next'];
  if (!parser) {
    throw new Error('The SWC Next parser is not registered.');
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
    formatWithSwcNext('return require("example")', {
      filepath: 'example.cjs',
      parser: 'swc-next',
    }),
  ).resolves.toBe('return require("example");\n');
});

test('matches the official hashbang AST shape', async () => {
  const parser = swcNextPlugin.parsers?.['swc-next'];
  if (!parser) {
    throw new Error('The SWC Next parser is not registered.');
  }

  const options = { filepath: 'example.js' } as ParserOptions;
  const astWithoutHashbang = (await parser.parse(
    'const value = 1',
    options,
  )) as Record<string, unknown>;
  const astWithHashbang = (await parser.parse(
    '#!/usr/bin/env node\nconst value = 1',
    options,
  )) as Record<string, unknown>;

  expect(Object.hasOwn(astWithoutHashbang, 'hashbang')).toBe(true);
  expect(astWithoutHashbang.hashbang).toBeNull();
  expect(Object.hasOwn(astWithHashbang, 'hashbang')).toBe(false);
});

test('reports SWC Next diagnostics with Prettier locations', async () => {
  const error = await formatWithSwcNext('\n\nconst = 1', {
    parser: 'swc-next-ts',
  }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(SyntaxError);

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
});

test.each(['js', 'jsx', 'ts', 'tsx'])(
  'uses SWC Next by default for .%s files',
  async (extension) => {
    const plugins = await getPrettierPlugins({}, `example.${extension}`);
    expect(plugins).toContain(swcNextPlugin);
    await expect(
      format('const value = {answer:42}', {
        filepath: `example.${extension}`,
        plugins,
      }),
    ).resolves.toBe('const value = { answer: 42 };\n');
  },
);

test.each(['example.d.ts', 'example.d.mts', 'example.d.cts'])(
  'formats declarations in %s',
  async (filepath) => {
    await expect(
      formatWithSwcNext('export declare function value(x:string):number', {
        filepath,
        parser: 'swc-next-ts',
      }),
    ).resolves.toBe('export declare function value(x: string): number;\n');
  },
);
