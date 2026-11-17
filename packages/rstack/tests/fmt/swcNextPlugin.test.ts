import { format, getFileInfo, type Options } from 'prettier';
import { describe, expect, rs, test } from 'rstack/test';
import { formatFmtSource } from '../../src/fmt/format.ts';
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

test.each([
  ['js', 'swc'],
  ['jsx', 'swc'],
  ['ts', 'swc-ts'],
  ['tsx', 'swc-tsx'],
])('infers the official parser for .%s files', async (extension, parser) => {
  await expect(
    getFileInfo(`example.${extension}`, { plugins: [swcNextPlugin] }),
  ).resolves.toEqual({ ignored: false, inferredParser: parser });
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

test('keeps SWC enabled for plugins that do not override JavaScript parsers', async () => {
  await expect(
    getPrettierPlugins(
      { plugins: [await import('heading-case')] },
      'example.js',
    ),
  ).resolves.toContain(swcNextPlugin);
});

test.each([
  ['js', 'swc'],
  ['javascript', 'swc'],
  ['node', 'swc'],
  ['jsx', 'swc'],
  ['ts', 'swc-ts'],
  ['typescript', 'swc-ts'],
  ['tsx', 'swc-tsx'],
  ['typescriptreact', 'swc-tsx'],
])('formats %s Markdown fences with %s', async (language, parser) => {
  const parse = rs.spyOn(swcNextPlugin.parsers![parser], 'parse');
  try {
    for (const extension of ['md', 'mdx']) {
      const source = `# api usage\n\n\`\`\`${language}\nconst value={answer:42}\n\`\`\`\n`;
      const request = {
        path: `example.${extension}`,
        options: { plugins: [await import('heading-case')] },
      };
      const result = await formatFmtSource(request, () => source);
      expect(result).toMatchObject({
        formatted: `# api usage\n\n\`\`\`${language}\nconst value = { answer: 42 };\n\`\`\`\n`,
      });
      expect(parse).toHaveBeenCalled();
      parse.mockClear();
    }
  } finally {
    parse.mockRestore();
  }
});

test('preserves Markdown host behavior and formats nested fences', async () => {
  const source = [
    'import {a} from "a"',
    '',
    'export const value={answer:42}',
    '',
    '<Component value={1+2} />',
    '',
    '> ```tsx',
    '> const view=<Component value={{a:1}}/>',
    '> ```',
    '',
    '```js',
    'const = invalid',
    '```',
    '',
    '```css',
    'a{color:red}',
    '```',
  ].join('\n');
  const request = { path: 'example.mdx', options: {} };
  const result = await formatFmtSource(request, () => source);
  const formatted = await format(source, { parser: 'mdx' });
  expect(result).toMatchObject({ formatted });
  expect(await formatFmtSource(request, () => formatted)).toMatchObject({
    formatted,
  });
});

test('honors embeddedLanguageFormatting and project JS parsers in Markdown', async () => {
  const source = '```js\nconst value={answer:42}\n```\n';
  await expect(
    formatFmtSource(
      {
        path: 'example.md',
        options: { embeddedLanguageFormatting: 'off' },
      },
      () => source,
    ),
  ).resolves.toMatchObject({ formatted: source });
  const parse = rs.spyOn(swcNextPlugin.parsers!.swc, 'parse');
  try {
    const options = { plugins: [await import('prettier/plugins/babel')] };
    await expect(
      formatFmtSource({ path: 'example.md', options }, () => source),
    ).resolves.toMatchObject({
      formatted: '```js\nconst value = { answer: 42 };\n```\n',
    });
    expect(parse).not.toHaveBeenCalled();
  } finally {
    parse.mockRestore();
  }
});

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
  'rejects function implementations in %s',
  async (filepath) => {
    await expect(
      formatWithSwcNext('export function value() { return 1; }', {
        filepath,
        parser: 'swc-next-ts',
      }),
    ).rejects.toThrow(
      'An implementation cannot be declared in ambient contexts',
    );
  },
);

describe('formatting compatibility', () => {
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
      name: 'single-member unions with comments',
      parser: 'swc-next-ts' as const,
      source: 'type Value = | // value\nstring;',
      expected: 'type Value =\n  // value\n  string;\n',
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
  ])('formats $name', async (fixture) => {
    await expect(
      formatWithSwcNext(fixture.source, {
        filepath: fixture.filepath,
        parser: fixture.parser,
      }),
    ).resolves.toBe(fixture.expected);
  });

  test.each(['swc-next', 'swc-next-ts'] as const)(
    'normalizes nested template expressions with %s',
    async (parser) => {
      const source =
        'const result=`outer ${(`inner ${(a || (b || c))}`)} ${/** @type {Foo} */ (value)}`';
      const formatted = await formatWithSwcNext(source, { parser });

      expect(formatted).toBe(
        'const result = `outer ${`inner ${a || b || c}`} ${/** @type {Foo} */ (value)}`;\n',
      );
      expect(await formatWithSwcNext(formatted, { parser })).toBe(formatted);
    },
  );
});

test.each([
  { requirePragma: true },
  { insertPragma: true },
  { checkIgnorePragma: true },
  { rangeStart: 20 },
  { rangeEnd: 20 },
  { objectWrap: 'collapse' as const },
  { experimentalTernaries: true },
  { experimentalOperatorPosition: 'start' as const },
])(
  'rejects unsupported SWC options instead of changing parsers: %j',
  async (options) => {
    await expect(
      formatFmtSource({ path: 'example.js', options }, () => ''),
    ).rejects.toThrow('SWCFMT');
  },
);

test.each([
  '// a ` marker\nconst value={answer:42}',
  'const value=`answer: ${42}`',
  'const query = /* GraphQL */ `query{user{id name}}`',
])('uses SWCFMT for templates and comments: %s', async (source) => {
  const result = await formatFmtSource(
    { path: 'example.js', options: {} },
    () => source,
  );
  expect(result).toEqual({
    status: 'formatted',
    source,
    formatted: await formatWithSwcNext(source, { parser: 'swc-next' }),
  });
});

test('leaves embedded template contents unchanged unless Prettier is explicitly selected', async () => {
  const source = 'const query = /* GraphQL */ `query{user{id name}}`';
  const result = await formatFmtSource(
    { path: 'example.js', options: {} },
    () => source,
  );
  expect(result).toMatchObject({ formatted: `${source};\n` });
  const explicit = await formatFmtSource(
    { path: 'example.js', options: { parser: 'babel' } },
    () => source,
  );
  expect(explicit).toMatchObject({
    formatted: await format(source, { parser: 'babel' }),
  });
  expect(explicit).not.toEqual(result);
});

test('honors a project parser plugin and its embedded-language support', async () => {
  const source = 'const query = /* GraphQL */ `query{user{id name}}`';
  const result = await formatFmtSource(
    {
      path: 'example.js',
      options: {
        plugins: [await import('prettier/plugins/babel')],
        rangeEnd: 1000,
      },
    },
    () => source,
  );
  expect(result).toMatchObject({
    formatted: await format(source, { parser: 'babel' }),
  });
});

test('reports unsupported import-source syntax instead of retrying another parser', async () => {
  await expect(
    formatFmtSource(
      { path: 'example.js', options: {} },
      () => 'import source mod from "./module.wasm";',
    ),
  ).rejects.toThrow('formatting import phase');
});

test('supports CommonJS source semantics for .cjs files', async () => {
  await expect(
    formatWithSwcNext('return require("example")', {
      filepath: 'example.cjs',
      parser: 'swc-next',
    }),
  ).resolves.toBe('return require("example");\n');
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

test('formats typed arrow callbacks in conditional expressions', async () => {
  const input =
    'const configs = options ? Object.entries(options).map(([name, content]): ConfigItem => ({ name, content })) : undefined;';
  const options = { filepath: 'example.ts', parser: 'swc-next-ts' as const };
  const formatted = await formatWithSwcNext(input, options);

  expect(formatted).toBe(await format(input, { parser: 'typescript' }));
  expect(await formatWithSwcNext(formatted, options)).toBe(formatted);
});
