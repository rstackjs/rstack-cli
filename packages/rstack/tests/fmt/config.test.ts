import path from 'node:path';
import { expect, test } from 'rstack/test';
import { normalizeFmtConfig, resolveFmtOptions } from '../../src/fmt/config.ts';

const rootPath = path.join(import.meta.dirname, 'project');

test('reuses base options when no override matches', () => {
  const config = normalizeFmtConfig(
    {
      singleQuote: true,
      overrides: [{ files: '*.ts', options: { semi: false } }],
    },
    rootPath,
  );

  expect(resolveFmtOptions(path.join(rootPath, 'index.js'), config)).toBe(config.baseOptions);
});

test('applies basename and path overrides in declaration order', () => {
  const config = normalizeFmtConfig(
    {
      singleQuote: false,
      overrides: [
        {
          files: '*.ts',
          excludeFiles: '*.test.ts',
          options: { semi: false },
        },
        {
          files: 'src/**/*.{ts,tsx}',
          options: { singleQuote: true },
        },
        {
          files: 'src/**/index.ts',
          options: { semi: true, tabWidth: 4 },
        },
      ],
    },
    rootPath,
  );

  const options = resolveFmtOptions(path.join(rootPath, 'src/index.ts'), config);
  const testOptions = resolveFmtOptions(path.join(rootPath, 'src/index.test.ts'), config);

  expect(options).not.toBe(config.baseOptions);
  expect(options).toEqual({ semi: true, singleQuote: true, tabWidth: 4 });
  expect(testOptions).toEqual({ singleQuote: true });
  expect(config.baseOptions).toEqual({ singleQuote: false });
});
