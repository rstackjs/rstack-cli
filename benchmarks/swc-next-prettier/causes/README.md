# Cause investigation

<!-- cspell:words onepass -->

The main regression comes from **losing the old SWC parser on fallback and
embedded code**, especially TypeScript. This is a routing change in this Rstack
POC: the published plugin does not itself choose the Prettier fallback.
Repeated same-version controls reproduce the slowdown and restoring the old
adapter recovers it with identical output on this input. Prettier's version
change, duplicate selection and unused plugin loading do not explain the main gap.

## Controlled CLI results

These are additional experiments on 2026-11-17; earlier benchmark values remain
in the parent report. Same Apple M5 Max/macOS 26.6.2, Node 24.20.0, pnpm 12.18.0,
four workers and fixed Rsbuild `ad8388c5befec29f5ccf765857faf126c1f05d5d`.
Each variant has two warmups and seven measured CLI processes per group, with
rotating/interleaved order. No concurrent builds or other benchmark batches run
during measurement. Config, ignores, `heading-case`, input bytes and file lists
are identical. Persistent cache is disabled with `--check --no-cache`.

| Variant                                                     | Prettier | Fallback JS/TS, 462 files | Other languages, 1,036 files |
| ----------------------------------------------------------- | -------- | ------------------------: | ---------------------------: |
| Original SWC parser/ESTree adapter (`before310`)            | 3.10.1   |                 473.16 ms |                   1186.68 ms |
| Same adapter (`before399`)                                  | 3.9.9    |                 457.24 ms |                   1173.36 ms |
| Native Prettier parser control (`native310`)                | 3.10.1   |                 655.66 ms |                   1285.40 ms |
| Native Prettier parser control (`native399`)                | 3.9.9    |                 650.33 ms |                   1276.10 ms |
| Current official-plugin POC (`after`)                       | 3.9.9    |                 661.25 ms |                   1273.74 ms |
| After, resolve plugins/parser once (`after-onepass`)        | 3.9.9    |                 655.06 ms |                   1279.51 ms |
| After, stub unused official import (`after-no-plugin-load`) | 3.9.9    |                 645.76 ms |                   1284.30 ms |
| After, restore old fallback adapter (`after-old-fallback`)  | 3.9.9    |                 445.33 ms |                   1185.91 ms |

- **Confirmed:** holding Prettier at 3.9.9 and changing the old adapter to native
  parsers adds 193.08 ms (+42.23%) on fallback JS/TS and 102.74 ms (+8.76%) on
  other languages. Current after adds 204.00 ms and 100.38 ms respectively over
  that same old-adapter control. The parser-route substitution reproduces most
  of the regression without the new plugin or new selection logic.
- **Not the main cause:** changing 3.10.1 to 3.9.9 makes the old-adapter runs
  slightly faster (-3.36% / -1.12%). Both native-parser versions are slow.
  The official plugin is only run with its supported exact peer, 3.9.9.
- **Small/uncertain secondary effects:** avoiding duplicate selection saves
  6.19 ms (0.94%) on fallback, but costs 5.76 ms on other languages. Stubbing
  the unused official module saves 15.49 ms (2.34%) on fallback but costs
  10.55 ms on other languages. These are medians from repeated runs, not
  separately established stable gains; do not add them or assign an exact
  percentage of the regression to them. Scheduling/JIT/GC and interop effects
  remain possible contributors to the small residual, not isolated causes.

All eight variants process the exact manifests and exit 0 in these two scopes.
Their written outputs have identical SHA-256 hashes, and all subsequent
idempotence checks exit 0. Raw warmups, all seven samples, output audits,
stdout/stderr, versions and built `format.js` hashes are in
[`matrix/results.json`](matrix/results.json). No timed samples were discarded.

## Actual call paths and phase evidence

The [old adapter](https://github.com/rstackjs/rstack-cli/blob/d1efeb312051868b29c7f5077fb021996b4da866/packages/rstack/src/fmt/swcNextPlugin.ts#L554)
registers `babel` and `typescript` backed by SWC parse plus AST postprocessing;
its printer is Prettier ESTree. Templates do **not** cause a switch to Prettier's
parser. The adapter is in the default plugin list for other host languages too,
so embedded JS/TS inherits those overrides. Project plugins follow it and retain
precedence. JavaScript uses a Babel-compatible File root; TypeScript a Program.

The new [selection](../../../packages/rstack/src/fmt/prettierPlugins.ts) imports
project plugins and checks their parser names, then selects SWC only for eligible
JS/TS files. [Formatting](../../../packages/rstack/src/fmt/format.ts) first infers
a parser, reads source once, then repeats plugin/parser selection if the source
contains any backtick. If embedding is enabled, this second selection removes
the official plugin. The fallback list has no Babel/TypeScript override at all.
Other file types also receive no such override, including their embedded code.
Thus both paths use Prettier's own Babel/TypeScript parser and ESTree printer.
The backtick test selects the slower parser route; its scan cost is not the
measured 193 ms parser-route penalty.

For eligible files, the published plugin's parser creates a native SWC formatting
document, decodes it and returns it; its printer returns `node.doc`. See the
[readable source](https://github.com/swc-project/swc-next/blob/0f36ba718361279dfaf2b4f2e9a468c2cade976d/npm/formatter-prettier-plugin/src-js/index.js#L5).
The installed 0.7.0 module was compared byte for byte with its downloadable npm
tarball ([hashes](published-plugin.json)); the published module contains the same
lazy `binding ??= import("@swc-next/formatter-js")` inside parse. It does not load
the native formatter merely by importing the plugin wrapper.

Separate four-worker instrumented runs wrap actual parser calls. These are
**accumulated inclusive elapsed milliseconds across workers, not CLI wall time,
CPU samples, or values to add to the CLI table**. Instrumentation preloads Babel
and TypeScript, wraps parsers and writes small trace records; it changes startup
and adds overhead. Counts include nested parser invocations/attempts, not unique
host files. The instrumented CLI still checks all files and exits 0.

| Scope / route (Prettier 3.9.9)  | JS parser calls | TS parser calls | JS parse total | TS parse total | Combined parse after subtracting each worker/parser's first call |
| ------------------------------- | --------------: | --------------: | -------------: | -------------: | ---------------------------------------------------------------: |
| Fallback: old SWC adapter       |              40 |             422 |        5.88 ms |      104.89 ms |                                                        102.65 ms |
| Fallback: native parser control |              40 |             422 |       29.68 ms |      645.58 ms |                                                        631.30 ms |
| Fallback: after                 |              40 |             422 |       31.99 ms |      702.18 ms |                                                        686.79 ms |
| Other: old SWC adapter          |             708 |           2,428 |       32.22 ms |       77.78 ms |                                                        102.86 ms |
| Other: native parser control    |             708 |           2,428 |       65.08 ms |      369.89 ms |                                                        412.52 ms |
| Other: after                    |             708 |           2,428 |       67.75 ms |      364.72 ms |                                                        409.33 ms |

The 3,136 Babel/TypeScript calls in the other-language scope are embedded code,
not additional top-level JS/TS files. Native special expression parsers remain
native on both variants. TypeScript accounts for most of the measured parse
increase. Removing first calls leaves the gap, so this is also per-file work,
not only first-use initialization. Old parser timing includes AST adaptation;
this does not isolate the native parser implementation alone.

In the same instrumented old/native control, total `format` time rises from
1158.55 to 1686.23 accumulated ms for fallback; JS/TS parse rises from 110.77 to
675.25 ms. For other languages, format rises from 3668.05 to 3960.81 ms while
embedded JS/TS parse rises from 110.00 to 434.97 ms. The non-JS/TS-parse remainder
is not higher in these controls. It includes comment attachment, host parsing,
embedding, document construction, rendering and instrumentation; it is **not**
an isolated printer timer. These phase observations support the repeated CLI
controls, but are not a precise additive decomposition of wall time.

[Worker loading](../../../packages/rstack/src/fmt/worker.ts) and the
[four-worker pool](../../../packages/rstack/src/fmt/workerPool.ts) are unchanged:
workers start eagerly, but the formatter module loads lazily on the first
uncached file. Instrumented per-worker module wait was 18.4–19.2 / 23.2–23.9 /
23.7–23.9 ms for old/native/after on fallback, and 19.0–19.3 / 18.6–19.3 /
18.0–18.1 ms on other languages. Per-worker first `format` was 6.7–11.8 /
11.9–20.5 / 14.5–24.2 ms on fallback. These small instrumented startup samples
are descriptive only. After has 924 plugin-selection/file-info calls for 462
fallback files, and 1481 for 1036 other files. Sampled loaded-library reports
show **no official formatter native binding** in either after scope (only the
Rstack binding). Native controls intentionally retain the old module imports;
they still load the old parser binding but never invoke its parser. See
[`trace/summary.json`](trace/summary.json) and per-worker records.

## Diagnostic recovery on the complete supported scope

This variant retains the official formatter for eligible files, but restores
the old SWC parser/ESTree adapter for fallback and embedded code. It keeps
embedding enabled, project-plugin precedence and the same file lists. This is
an isolated experiment, **not a shipped runtime change**.

| Scope                       | Files | Old adapter, 3.9.9 | Current after | After + old fallback | Change versus after | After / hybrid |
| --------------------------- | ----: | -----------------: | ------------: | -------------------: | ------------------: | -------------: |
| All JS/TS                   | 2,403 |          800.73 ms |     955.64 ms |            759.81 ms |             -20.49% |         1.258x |
| Complete supported manifest | 3,439 |         1680.10 ms |    1896.45 ms |           1656.04 ms |             -12.68% |         1.145x |

Each row is a separately timed CLI process over its complete manifest; no group
times are added. Two warmups plus seven interleaved samples per variant are in
[`hybrid/results.json`](hybrid/results.json). Different batches and the explicit
manifest discovery workload mean these absolute times should not be substituted
for earlier `fmt .` results. Hybrid is 5.11% / 1.43% faster than the same-version
old-adapter control in this batch; the smaller difference is not a general claim.

After and hybrid produce byte-identical output across both scopes. Both exit 1
on original input for the same six formatting differences, then exit 0 for
`--write` and idempotence. Before exits 0 throughout. The existing normalized
AST/comment audit of those same outputs remains applicable; no Rsbuild runtime
suite was run. Import-source remains excluded equally and remains unsupported.

Additional [route traces](trace-hybrid/summary.json) confirm identical coverage:
both variants select 1,941 SWC files, of which 1,925 actually call the official
parser (822 JS, 1031 TS, 72 TSX). The other 16 are empty/whitespace-only files
that Prettier short-circuits before parsing (`prettier/index.mjs`, `coreFormat`).
The original inventory's 1,941 is therefore a **selected-route** count, not a
native-call count. All 462 fallback files still parse (40 JS / 422 TS), changing
only from native Prettier to the old SWC adapter. The full supported scope also
retains all 3,136 embedded Babel/TypeScript calls. No files or embedded formatting
are dropped to obtain the speedup.

The feasible local remedy is a hybrid parser/formatter integration; its cost is
retaining the legacy adapter and direct parser dependency that this migration
sought to remove. It needs broader option/plugin compatibility testing before
shipping. A longer-term upstream option is an official compatible AST-parser
fallback or embedded-language support. The experiment establishes neither that
upstream implementation nor its performance. The only runtime-source edit in
this investigation fixes the existing CI indentation failure in `worker.ts`;
performance variants remain confined to the benchmark harness.

## Reproduce and inspect

The experiments in this directory diagnose the existing POC without replacing
the main before baseline with plain Prettier. `prepare.py` copies built CLI
artifacts into an isolated directory, then makes narrow diagnostic substitutions
in `dist/format.js`. Dependencies remain symlinked to the installed, locked
packages. `run.py` times the real CLI with four workers, two warmups and seven
rotating/interleaved repetitions, and checks input bytes, file counts, outputs
and idempotence. `trace.py` runs separate instrumented copies after timing.

```sh
python3 benchmarks/swc-next-prettier/causes/prepare.py \
  --before /path/to/rstack-before --after /path/to/rstack-after \
  --output /tmp/rstack-cause-variants
python3 benchmarks/swc-next-prettier/causes/run.py \
  --variants /tmp/rstack-cause-variants/variants.json \
  --rsbuild /path/to/rsbuild --output /tmp/rstack-cause-matrix \
  --names before310 before399 native310 native399 after after-onepass after-no-plugin-load after-old-fallback
python3 benchmarks/swc-next-prettier/causes/run.py \
  --variants /tmp/rstack-cause-variants/variants.json \
  --rsbuild /path/to/rsbuild --output /tmp/rstack-cause-hybrid \
  --names before399 after after-old-fallback --groups js-ts supported
python3 benchmarks/swc-next-prettier/causes/trace.py \
  --variants /tmp/rstack-cause-variants/variants.json \
  --matrix /tmp/rstack-cause-matrix/results.json --output /tmp/rstack-cause-trace
python3 benchmarks/swc-next-prettier/causes/trace.py \
  --variants /tmp/rstack-cause-variants/variants.json \
  --matrix /tmp/rstack-cause-hybrid/results.json --output /tmp/rstack-cause-trace-hybrid \
  --names after after-old-fallback --groups js-ts supported
```

The fixed Rsbuild archive SHA-256 is
`daa43836f99668564759c341832ce0ce699e64fd1d04fd394ba17dc229d9cf2e`.
Each results file also records manifest hashes and exact CLI argument structure;
adjacent `*.files.json` files contain every relative path passed to the CLI.
Trace inputs use the same isolated directories, restored to original bytes by
the matrix output audit. `prepare.py` expects the before commit and this POC's
built artifacts and installed dependencies; use the build instructions in the
parent report. It refuses to overwrite existing variant directories.

The no-plugin-load control only applies to the fallback/other scopes: it stubs
the official plugin import, which is never used to parse those files. It is not
a valid implementation for the SWC subset. The one-pass control reads input
before parser discovery to avoid repeated selection; it is diagnostic, not a
production change. The old-fallback control restores the old adapter on every
fallback path, including embedded code; shipping it would retain the parser
dependency and local adapter maintenance, contrary to the migration's removal
goal. The official plugin is never tested with its unsupported Prettier 3.10.1
peer. Native controls retain the old module imports and change parser selection
only; they are diagnostic controls, not the main baseline.

Instrumented worker times include overhead and may overlap across workers.
Never sum them and call the result CLI wall time. Parser timers include adapter
postprocessing for the old SWC route. Remaining format time includes comment
attachment, embedding, document construction and rendering, not just printing.

## Validation

All matrix and recovery samples pass count/input/output/idempotence assertions;
the separate traces verify actual parser coverage. Python and JavaScript syntax,
JSON records, seven-sample medians and output hashes were checked. Running the
final preparation script again reproduces all eight experimental `format.js`
hashes. `pnpm check`, `pnpm check:spell`, the full `rs fmt --check --no-cache`
and `git diff --check` pass. The initial spell check flagged only the experiment
name `onepass`; the report now declares that identifier locally. The old lint CI
failure was confirmed as `worker.ts` indentation and fixed in a separate commit.
No runtime behavior or Rust code changed, so the previously passed runtime/Rust
suites were not repeated for this investigation.
