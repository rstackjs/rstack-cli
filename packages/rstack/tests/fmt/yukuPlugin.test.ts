import { format, getFileInfo, type Options, type ParserOptions } from 'prettier';
import { expect, test } from 'rstack/test';
import { yukuPlugin } from '../../src/fmt/yukuPlugin.ts';

const formatWithYuku = (
  source: string,
  options: Options & { parser: 'yuku' | 'yuku-ts' },
): Promise<string> =>
  format(source, {
    filepath: `example.${options.parser === 'yuku' ? 'js' : 'ts'}`,
    plugins: [yukuPlugin],
    ...options,
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
