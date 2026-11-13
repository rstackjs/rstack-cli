import { expect, test } from 'rstack/test';
import {
  expectWriteSummary,
  normalizeDuration,
  setupFmtTest,
} from './helpers.ts';

const {
  projectFileExists,
  readProjectFile,
  resolveProjectPath,
  runFmt,
  writeProjectFile,
} = setupFmtTest();

interface SerializedFmtCache {
  version: number;
  namespace: string;
  options: string[];
  files: (string | number)[];
}

const readFmtCache = (filePath: string): SerializedFmtCache =>
  JSON.parse(readProjectFile(filePath)) as SerializedFmtCache;

const expectSingleCleanEntry = (
  cache: SerializedFmtCache,
  filePath: string,
): void => {
  expect(cache.version).toBe(2);
  expect(typeof cache.namespace).toBe('string');
  expect(cache.options).toHaveLength(1);
  expect(cache.options[0]).toHaveLength(16);
  expect(cache.files).toHaveLength(4);
  expect(cache.files[0]).toBe(filePath);
  expect(cache.files[1]).toEqual(expect.any(String));
  expect(cache.files.slice(2)).toEqual([0, 0]);
};

test.each([
  ['write', []],
  ['check', ['--check']],
  ['list-different', ['--list-different']],
] as const)('uses the default cache in %s mode', (_, args) => {
  writeProjectFile('index.ts', 'const value = 1;\n');
  writeProjectFile('.rstack/cache/fmt-v1.json', 'legacy');

  const result = runFmt([...args, 'index.ts']);

  expect(result.status).toBe(0);
  expect(readProjectFile('.rstack/cache/.gitignore')).toBe('*\n');
  expectSingleCleanEntry(
    readFmtCache('.rstack/cache/fmt/cache.json'),
    'index.ts',
  );
  expect(readProjectFile('.rstack/cache/fmt-v1.json')).toBe('legacy');
});

test('--no-cache bypasses cache reads and writes', () => {
  writeProjectFile('index.ts', 'const value=1');
  writeProjectFile('custom-cache/v1.json', '{"value":true}');

  const first = runFmt([
    '--no-cache',
    '--cache-location',
    'custom-cache',
    'index.ts',
    'custom-cache/v1.json',
  ]);

  expect(first.status).toBe(0);
  expect(readProjectFile('custom-cache/v1.json')).toBe('{ "value": true }\n');
  expect(projectFileExists('.rstack')).toBe(false);

  writeProjectFile('.rstack/cache/fmt-v1.json', 'stale');
  writeProjectFile('index.ts', 'const value=2');
  const second = runFmt(['--no-cache', 'index.ts']);

  expect(second.status).toBe(0);
  expect(readProjectFile('index.ts')).toBe('const value = 2;\n');
  expect(readProjectFile('.rstack/cache/fmt-v1.json')).toBe('stale');
  expect(projectFileExists('.rstack/cache/.gitignore')).toBe(false);
});

test('--clear-cache resolves the config root without loading config or formatting', () => {
  writeProjectFile('rstack.config.ts', 'throw new Error("must not load");');
  expect(runFmt(['--clear-cache']).status).toBe(0);
  expect(projectFileExists('.rstack')).toBe(false);

  writeProjectFile('.rstack/cache/fmt/cache.json', 'stale cache');
  writeProjectFile('packages/app/index.ts', 'const value=1');

  const result = runFmt(
    ['--clear-cache', '--config', '../../rstack.config.ts'],
    resolveProjectPath('packages/app'),
  );

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Formatting cache cleared:');
  expect(result.stderr).toBe('');
  expect(projectFileExists('.rstack/cache/fmt/cache.json')).toBe(false);
  expect(readProjectFile('packages/app/index.ts')).toBe('const value=1');
});

test('--clear-cache only deletes its own cache file at a custom location', () => {
  writeProjectFile('rstack.config.ts', 'throw new Error("must not load");');
  writeProjectFile('.rstack/cache/fmt/cache.json', 'default cache');
  writeProjectFile('custom-cache/cache.json', 'custom cache');
  writeProjectFile('custom-cache/keep.txt', 'keep file');

  const result = runFmt(['--clear-cache', '--cache-location', 'custom-cache']);

  expect(result.status).toBe(0);
  expect(projectFileExists('custom-cache/cache.json')).toBe(false);
  expect(readProjectFile('custom-cache/keep.txt')).toBe('keep file');
  expect(readProjectFile('.rstack/cache/fmt/cache.json')).toBe('default cache');
});

test.each(['--check', 'index.ts', '--no-cache'])(
  '--clear-cache rejects conflicting argument %s',
  (arg) => {
    writeProjectFile('.rstack/cache/fmt/cache.json', 'keep cache');

    const result = runFmt(['--clear-cache', arg]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('The --clear-cache option cannot be used');
    expect(readProjectFile('.rstack/cache/fmt/cache.json')).toBe('keep cache');
  },
);

test('--clear-cache reports deletion errors without removing directories', () => {
  writeProjectFile('.rstack/cache/fmt/cache.json/keep.txt', 'keep file');

  const result = runFmt(['--clear-cache']);

  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(readProjectFile('.rstack/cache/fmt/cache.json/keep.txt')).toBe(
    'keep file',
  );
});

test('bypasses the cache for files using the Tailwind plugin', () => {
  writeProjectFile(
    'rstack.config.ts',
    `import { define } from 'rstack';

define.fmt({
  overrides: [{
    files: '*.html',
    options: {
      plugins: ['prettier-plugin-tailwindcss'],
      tailwindStylesheet: ${JSON.stringify(resolveProjectPath('app.css'))},
    },
  }],
});
`,
  );
  writeProjectFile('index.html', '<div class="alpha beta"></div>\n');
  writeProjectFile('index.ts', 'const value = 1;\n');
  writeProjectFile(
    'app.css',
    '@utility alpha { display: flex; }\n@utility beta { padding: 1rem; }\n',
  );

  expect(runFmt(['--check', 'index.html', 'index.ts']).status).toBe(0);

  writeProjectFile(
    'app.css',
    '@utility alpha { padding: 1rem; }\n@utility beta { display: flex; }\n',
  );
  expect(runFmt(['--check', 'index.html']).status).toBe(1);
  expect(runFmt(['index.html']).status).toBe(0);
  expect(readProjectFile('index.html')).toBe(
    '<div class="beta alpha"></div>\n',
  );
  expectSingleCleanEntry(
    readFmtCache('.rstack/cache/fmt/cache.json'),
    'index.ts',
  );
});

test.each(['relative', 'absolute'] as const)(
  'uses a %s custom cache location',
  (kind) => {
    const cacheLocation =
      kind === 'relative' ? 'custom-cache' : resolveProjectPath('custom-cache');
    writeProjectFile('index.ts', 'const value = 1;\n');

    const result = runFmt(['--cache-location', cacheLocation, 'index.ts']);

    expect(result.status).toBe(0);
    expectSingleCleanEntry(readFmtCache('custom-cache/cache.json'), 'index.ts');
    expect(projectFileExists('custom-cache/.gitignore')).toBe(false);
    expect(projectFileExists('.rstack')).toBe(false);
  },
);

test.each(['.', '..'])(
  'rejects a custom cache location at %s',
  (cacheLocation) => {
    const result = runFmt(['--cache-location', cacheLocation, '.']);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'The --cache-location directory cannot be the current working directory or an ancestor.',
    );
  },
);

test('excludes the custom cache directory from formatting', () => {
  const cacheLocation = 'custom-cache';
  writeProjectFile('index.ts', 'const value = 1;\n');
  writeProjectFile('custom-cache/nested/ignored.ts', 'const value=2');
  expect(runFmt(['--cache-location', cacheLocation, 'index.ts']).status).toBe(
    0,
  );

  const result = runFmt(['--cache-location', cacheLocation, '.']);

  expect(result.status).toBe(0);
  expectWriteSummary(result.stdout, 2, 0);
  expect(readProjectFile('custom-cache/nested/ignored.ts')).toBe(
    'const value=2',
  );
});

test('uses an explicit config root cache from a subdirectory', () => {
  const appPath = resolveProjectPath('packages/app');
  writeProjectFile('packages/app/index.ts', 'const value = 1;\n');

  const result = runFmt(
    ['index.ts', '--config', '../../rstack.config.ts'],
    appPath,
  );

  expect(result.status).toBe(0);
  expect(readProjectFile('packages/app/index.ts')).toBe('const value = 1;\n');
  expect(projectFileExists('.rstack/cache/fmt/cache.json')).toBe(true);
  expect(projectFileExists('packages/app/.rstack')).toBe(false);
  expectSingleCleanEntry(
    readFmtCache('.rstack/cache/fmt/cache.json'),
    'packages/app/index.ts',
  );
});

test('recovers from a corrupted cache', () => {
  writeProjectFile('index.ts', 'const value = 1;\n');
  const first = runFmt(['--check', 'index.ts']);
  writeProjectFile('.rstack/cache/fmt/cache.json', '{');

  const second = runFmt(['--check', 'index.ts']);

  expect(second.status).toBe(0);
  expect(normalizeDuration(second.stdout)).toBe(
    normalizeDuration(first.stdout),
  );
  expect(second.stderr).toBe(first.stderr);
  expect(
    JSON.parse(readProjectFile('.rstack/cache/fmt/cache.json')),
  ).toMatchObject({ version: 2 });
});

test('formats without a writable cache directory', () => {
  writeProjectFile('.rstack', 'not a directory');
  writeProjectFile('index.ts', 'const value=1');

  const result = runFmt(['index.ts']);

  expect(result.status).toBe(0);
  expect(readProjectFile('index.ts')).toBe('const value = 1;\n');
});
