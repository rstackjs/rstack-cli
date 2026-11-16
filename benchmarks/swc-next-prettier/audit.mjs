// Run outside measured CLI invocations. Usage: node audit.mjs <before> <after> <results-dir>
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const [before, after, results] = process.argv.slice(2).map((p) => resolve(p));
const report = JSON.parse(readFileSync(join(results, 'results.json'), 'utf8'));
const input = join(report.workspace, 'after');
const originalRoot = mkdtempSync(join(tmpdir(), 'rsbuild-audit-'));
execFileSync('tar', ['-x', '-C', originalRoot], {
  input: execFileSync('git', ['archive', report.rsbuildCommit], {
    cwd: process.env.RSBUILD_REPO ?? '/Users/bytedance/Documents/codes/rsbuild',
    maxBuffer: 100 * 1024 * 1024,
  }),
});
const original = (path) => readFileSync(join(originalRoot, path), 'utf8');
const from = (root, path) => import(pathToFileURL(join(root, path)).href);
const { loadRstackConfig } = await from(after, 'packages/rstack/src/config.ts');
const { normalizeFmtConfig } = await from(
  after,
  'packages/rstack/src/fmt/config.ts',
);
const { discoverFmtFiles } = await from(
  after,
  'packages/rstack/src/fmt/discovery.ts',
);
const { getPrettierPlugins } = await from(
  after,
  'packages/rstack/src/fmt/prettierPlugins.ts',
);
const { swcNextPlugin } = await from(
  after,
  'packages/rstack/src/fmt/swcNextPlugin.ts',
);
const loaded = await loadRstackConfig({ cwd: input });
const config = normalizeFmtConfig(loaded.configs.fmt, input);
const files = await discoverFmtFiles({
  cwd: input,
  patterns: [
    ...(report.inputSelection?.fileList
      ? JSON.parse(readFileSync(join(results, 'files.json'), 'utf8'))
      : ['.']),
    ...(report.exclude ?? []).map((p) => `!${p}`),
  ],
  config,
});
const prettier = await from(after, 'node_modules/prettier/index.mjs');
const inventory = [];
for (const file of files) {
  const path = relative(input, file.path);
  const source = original(path);
  const plugins = await getPrettierPlugins(file.options, file.path, source);
  const info = await prettier.getFileInfo(file.path, {
    resolveConfig: false,
    plugins,
  });
  inventory.push({
    inferredParser: info.inferredParser,
    path,
    extension: extname(path),
    formatter: !info.inferredParser
      ? 'unsupported'
      : plugins.includes(swcNextPlugin)
        ? 'swc'
        : 'prettier',
    hasTemplateLiteralMarker: source.includes('`'),
  });
}
const parser = await from(
  before,
  'packages/rstack/node_modules/@swc-next/parser/dist/index.js',
);
const ignoredKeys = new Set(['start', 'end', 'range', 'loc', 'raw', 'extra']);
const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value === null || typeof value !== 'object') return value;
  if (value.type === 'ParenthesizedExpression')
    return normalize(value.expression);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !ignoredKeys.has(key))
      .map(([key, child]) => [key, normalize(child)]),
  );
};
const comparisons = [];
for (const entry of report.outputAudit.filter((item) => item.outputsDiffer)) {
  const source = original(entry.path);
  const formatted = readFileSync(join(input, entry.path), 'utf8');
  const options = {
    lang: parser.langFromPath(entry.path),
    sourceType: 'unambiguous',
    comments: 'all',
    errorRecovery: true,
  };
  const left = parser.parseSync(source, options);
  const right = parser.parseSync(formatted, options);
  comparisons.push({
    path: entry.path,
    beforeDiagnostics: left.diagnostics,
    afterDiagnostics: right.diagnostics,
    astEqualIgnoringLocationsRawAndParens:
      JSON.stringify(normalize(left.program)) ===
      JSON.stringify(normalize(right.program)),
    commentsEqual:
      JSON.stringify(normalize(left.comments)) ===
      JSON.stringify(normalize(right.comments)),
  });
}
const beforePrettier = await from(before, 'node_modules/prettier/index.mjs');
const { getPrettierPlugins: getBeforePlugins } = await from(
  before,
  'packages/rstack/src/fmt/prettierPlugins.ts',
);
const beforeInventory = [];
for (const file of files) {
  const info = await beforePrettier.getFileInfo(file.path, {
    resolveConfig: false,
    plugins: await getBeforePlugins(file.options, file.path),
  });
  beforeInventory.push({
    path: relative(input, file.path),
    parser: info.inferredParser,
  });
}
const summary = {
  beforeSupportedCount: beforeInventory.filter((entry) => entry.parser).length,
  beforeParserCounts: Object.fromEntries(
    [...new Set(beforeInventory.map((entry) => entry.parser))].map((parser) => [
      parser ?? 'unsupported',
      beforeInventory.filter((entry) => entry.parser === parser).length,
    ]),
  ),
  total: inventory.length,
  byFormatter: Object.fromEntries(
    ['swc', 'prettier', 'unsupported'].map((formatter) => [
      formatter,
      inventory.filter((f) => f.formatter === formatter).length,
    ]),
  ),
  byExtension: Object.fromEntries(
    [...new Set(inventory.map((f) => f.extension))]
      .sort()
      .map((extension) => [
        extension,
        inventory.filter((f) => f.extension === extension).length,
      ]),
  ),
  jsTsFallback: inventory.filter(
    (f) =>
      /\.(?:[cm]?[jt]s|[jt]sx)$/i.test(f.path) && f.formatter === 'prettier',
  ).length,
  comparisons,
};
const columns = [
  'path',
  'extension',
  'inferredParser',
  'formatter',
  'hasTemplateLiteralMarker',
];
writeFileSync(
  join(results, 'inventory.tsv'),
  [
    columns.join('\t'),
    ...inventory.map((entry) =>
      columns.map((key) => String(entry[key] ?? '')).join('\t'),
    ),
  ].join('\n') + '\n',
);
writeFileSync(
  join(results, 'audit.json'),
  JSON.stringify(summary, null, 2) + '\n',
);
console.log(JSON.stringify(summary, null, 2));
