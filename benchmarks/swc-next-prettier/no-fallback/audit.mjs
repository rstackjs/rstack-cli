// Outside CLI timing: independently parse every JS/TS input and output with SWC's parser.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [resultsPath, beforeRoot] = process.argv
  .slice(2)
  .map((value) => resolve(value));
const report = JSON.parse(
  readFileSync(join(resultsPath, 'results.json'), 'utf8'),
);
const parser = await import(
  pathToFileURL(
    join(
      beforeRoot,
      'packages/rstack/node_modules/@swc-next/parser/dist/index.js',
    ),
  )
);
const files = JSON.parse(
  readFileSync(join(resultsPath, 'js-ts.files.json'), 'utf8'),
);
const normalize = (value, key = '') => {
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (!value || typeof value !== 'object') return value;
  if (value.type === 'ParenthesizedExpression')
    return normalize(value.expression);
  // TemplateElement.value.raw is observable by tagged templates and must survive.
  const omitted = new Set(['start', 'end', 'range', 'loc', 'extra']);
  if (key !== 'value') omitted.add('raw');
  return Object.fromEntries(
    Object.entries(value)
      .filter(([name]) => !omitted.has(name))
      .map(([name, child]) => [name, normalize(child, name)]),
  );
};
const compare = (a, b) =>
  JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const output = {};
for (const [variant, audit] of Object.entries(report.groups['js-ts'].outputs)) {
  const records = [];
  const changed = new Set(audit.changed);
  for (const file of files) {
    const input = readFileSync(join(report.workspace, file), 'utf8');
    const text = changed.has(file)
      ? readFileSync(join(audit.changedOutputRoot, file), 'utf8')
      : input;
    const options = {
      lang: parser.langFromPath(file),
      sourceType: /\.(cjs|cts)$/.test(file)
        ? 'commonjs'
        : /\.(mjs|mts)$/.test(file)
          ? 'module'
          : 'unambiguous',
      comments: 'all',
      errorRecovery: true,
    };
    try {
      const a = parser.parseSync(input, options),
        b = parser.parseSync(text, options);
      records.push({
        file,
        changed: input !== text,
        inputDiagnostics: a.diagnostics,
        outputDiagnostics: b.diagnostics,
        astEqual: compare(a.program, b.program),
        commentsEqual: compare(a.comments, b.comments),
      });
    } catch (error) {
      records.push({ file, error: String(error) });
    }
  }
  output[variant] = {
    files: records.length,
    changed: records.filter((r) => r.changed).length,
    mismatches: records.filter(
      (r) => r.error || !r.astEqual || !r.commentsEqual,
    ),
    diagnostics: records.filter(
      (r) => r.inputDiagnostics?.length || r.outputDiagnostics?.length,
    ),
    records: records.filter(
      (r) =>
        r.changed ||
        r.error ||
        !r.astEqual ||
        !r.commentsEqual ||
        r.inputDiagnostics?.length ||
        r.outputDiagnostics?.length,
    ),
  };
}
writeFileSync(
  join(resultsPath, 'ast-audit.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(output).map(([name, { records, ...summary }]) => [
        name,
        summary,
      ]),
    ),
    null,
    2,
  ),
);
