import path from 'node:path';
import { expect, test } from 'rstack/test';
import { normalizeFmtConfig } from '../../src/fmt/config.ts';
import { formatText } from '../../src/fmt/format.ts';

const rootPath = import.meta.dirname;

test('applies per-file overrides and maps the cursor', async () => {
  const source = 'const value={message:"hello"}';
  const config = normalizeFmtConfig(
    {
      overrides: [
        {
          files: '*.ts',
          options: {
            singleQuote: true,
          },
        },
      ],
    },
    rootPath,
  );

  const result = await formatText(source, {
    config,
    cursorOffset: source.indexOf('message'),
    filePath: path.join(rootPath, 'example.ts'),
  });

  expect(result).toEqual({
    status: 'formatted',
    formatted: "const value = { message: 'hello' };\n",
    cursorOffset: 16,
  });
});

test('returns unsupported when no parser can be inferred', async () => {
  const config = normalizeFmtConfig(undefined, rootPath);

  await expect(
    formatText('plain text', {
      config,
      filePath: path.join(rootPath, 'unknown.extension'),
    }),
  ).resolves.toEqual({
    status: 'skipped',
    reason: 'unsupported',
  });
});

test('uses an explicit parser for unknown file extensions', async () => {
  const config = normalizeFmtConfig({ parser: 'babel' }, rootPath);

  const result = await formatText('const value={nested:true}', {
    config,
    filePath: path.join(rootPath, 'unknown.extension'),
  });

  expect(result).toEqual({
    status: 'formatted',
    formatted: 'const value = { nested: true };\n',
  });
});

test('formats an explicitly provided node_modules file', async () => {
  const config = normalizeFmtConfig(undefined, rootPath);

  const result = await formatText('const value={nested:true}', {
    config,
    filePath: path.join(rootPath, 'node_modules', 'example', 'index.js'),
  });

  expect(result).toEqual({
    status: 'formatted',
    formatted: 'const value = { nested: true };\n',
  });
});
