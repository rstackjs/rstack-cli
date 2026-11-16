// Diagnostic instrumentation only; never used for reported CLI wall-time medians.
import * as prettier from 'prettier';
import * as babel from 'prettier/plugins/babel';
import * as typescript from 'prettier/plugins/typescript';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { threadId } from 'node:worker_threads';

const state = {
  threadId,
  calls: 0,
  infoCalls: 0,
  infoMs: 0,
  formatMs: 0,
  firstFormatMs: 0,
  moduleWaitMs: 0,
  routeCalls: 0,
  routeMs: 0,
  parse: {},
};
globalThis.__fmtTrace = state;
const wrap = (plugin, origin) => ({
  ...plugin,
  parsers: Object.fromEntries(
    Object.entries(plugin.parsers ?? {}).map(([name, parser]) => [
      name,
      {
        ...parser,
        async parse(...args) {
          const key = `${origin}:${name}`;
          const record = (state.parse[key] ??= { calls: 0, ms: 0, firstMs: 0 });
          const start = performance.now();
          try {
            return await parser.parse(...args);
          } finally {
            const elapsed = performance.now() - start;
            if (!record.calls) record.firstMs = elapsed;
            record.calls++;
            record.ms += elapsed;
          }
        },
      },
    ]),
  ),
});
const native = [
  wrap(babel, 'prettier-babel'),
  wrap(typescript, 'prettier-typescript'),
];
export async function getFileInfo(...args) {
  const start = performance.now();
  try {
    return await prettier.getFileInfo(...args);
  } finally {
    state.infoCalls++;
    state.infoMs += performance.now() - start;
  }
}
export async function format(source, options) {
  const plugins = await Promise.all(
    options.plugins.map(async (plugin) => {
      if (typeof plugin === 'string' || plugin instanceof URL) {
        const imported = await import(String(plugin));
        plugin = imported.default ?? imported;
      }
      const parser = Object.values(plugin.parsers ?? {})[0];
      return wrap(
        plugin,
        parser?.astFormat === 'estree-swc-next'
          ? 'old-swc'
          : parser?.astFormat === 'SWCFMT'
            ? 'official-swc'
            : 'project',
      );
    }),
  );
  const start = performance.now();
  try {
    return await prettier.format(source, {
      ...options,
      plugins: [...native, ...plugins],
    });
  } finally {
    const elapsed = performance.now() - start;
    if (!state.calls) state.firstFormatMs = elapsed;
    state.calls++;
    state.formatMs += elapsed;
    if (state.calls === 1 || state.calls % 100 === 0)
      state.nativeLibraries = process.report
        .getReport()
        .sharedObjects.filter((path) => path.endsWith('.node'));
    writeFileSync(
      `${process.env.RSTACK_TRACE_DIR}/${threadId}.json`,
      JSON.stringify(state),
    );
  }
}
