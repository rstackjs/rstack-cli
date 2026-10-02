import path from 'node:path';
import { expect, test } from 'rstack/test';
import {
  createOptionsResolver,
  normalizeFmtConfig,
  resolveFmtConfig,
} from '../../src/fmt/config.ts';

const rootPath = path.join(import.meta.dirname, 'project');

test('shallowly merges fmt layers before normalizing options and overrides', async () => {
  const config = await resolveFmtConfig({
    layers: [
      {
        fmt: {
          singleQuote: true,
          semi: true,
          plugins: ['shared-plugin'],
          ignorePatterns: ['dist/**'],
          overrides: [{ files: '*.ts', options: { tabWidth: 8 } }],
          pluginOptions: { shared: true, project: false },
        },
      },
      {
        fmt: () =>
          Promise.resolve({
            semi: false,
            plugins: ['project-plugin'],
            ignorePatterns: ['generated/**'],
            overrides: [{ files: '*.ts', options: { semi: true } }],
            pluginOptions: { project: true },
          }),
      },
    ],
    configFilePath: path.join(rootPath, 'rstack.config.ts'),
    cwd: path.dirname(rootPath),
  });

  expect(config).toEqual({
    rootPath,
    baseOptions: {
      singleQuote: true,
      semi: false,
      plugins: ['project-plugin'],
      pluginOptions: { project: true },
    },
    ignorePatterns: ['generated/**'],
    overrides: [
      {
        matches: expect.any(Function) as unknown,
        options: { semi: true },
      },
    ],
  });
});

test('reuses base options when no override matches', () => {
  const config = normalizeFmtConfig(
    {
      singleQuote: true,
      overrides: [{ files: '*.ts', options: { semi: false } }],
    },
    rootPath,
  );
  const resolveOptions = createOptionsResolver(config);

  expect(resolveOptions(path.join(rootPath, 'index.js'))).toBe(
    config.baseOptions,
  );
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
  const resolveOptions = createOptionsResolver(config);

  const options = resolveOptions(path.join(rootPath, 'src/index.ts'));
  const testOptions = resolveOptions(path.join(rootPath, 'src/index.test.ts'));

  expect(options).not.toBe(config.baseOptions);
  expect(options).toEqual({ semi: true, singleQuote: true, tabWidth: 4 });
  expect(testOptions).toEqual({ singleQuote: true });
  expect(config.baseOptions).toEqual({ singleQuote: false });
});

test('reuses options for the same override combination', () => {
  const config = normalizeFmtConfig(
    {
      singleQuote: false,
      overrides: [
        { files: '*.ts', options: { semi: false } },
        { files: 'src/**/*.ts', options: { singleQuote: true } },
      ],
    },
    rootPath,
  );
  const resolveOptions = createOptionsResolver(config);

  const first = resolveOptions(path.join(rootPath, 'src/first.ts'));
  const second = resolveOptions(path.join(rootPath, 'src/second.ts'));
  const outside = resolveOptions(path.join(rootPath, 'outside.ts'));

  expect(first).toBe(second);
  expect(first).not.toBe(outside);
  expect(first).toEqual({ semi: false, singleQuote: true });
  expect(outside).toEqual({ semi: false, singleQuote: false });
});

test('applies overrides outside the config root', () => {
  const config = normalizeFmtConfig(
    {
      overrides: [{ files: '../shared/*.ts', options: { semi: false } }],
    },
    rootPath,
  );
  const resolveOptions = createOptionsResolver(config);

  expect(resolveOptions(path.join(rootPath, '../shared/index.ts'))).toEqual({
    semi: false,
  });
});
