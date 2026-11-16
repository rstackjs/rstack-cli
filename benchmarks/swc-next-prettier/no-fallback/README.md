# No-fallback SWCFMT POC

This follow-up removes automatic fallback for top-level JavaScript/TypeScript.
The official `@swc-next/formatter-prettier-plugin@0.7.0` (Prettier 3.9.9) now
handles files containing templates and backticks in comments too. The adapter
resolves plugins/parser once and reads the source once. Explicit non-SWC parsers
and project parser plugins retain precedence. Other host languages keep their
normal Prettier formatter, including embedded JS/TS. Unsupported SWC range,
pragma and layout options fail explicitly, including for empty inputs, rather
than silently selecting Prettier or being skipped. Any finite `rangeEnd` is
rejected. Unsupported syntax is not retried.

SWCFMT 0.7.0 does not format embedded HTML/CSS/GraphQL template contents. The
original-config comparison therefore includes a capability difference; the
separate `embedding-off` control disables embedded formatting on **all** variants.
This is an exploratory Draft POC, not a claim of full Prettier equivalence.

## Four-worker results

Original Rsbuild config; seven valid samples after two warmups. All successful-scope measurements exit 0 (old adapters) or 1 (format differences), never 2.

| Scope          | Files | Old adapter 3.10.1 | Old adapter 3.9.9 | Fallback POC | No fallback | Versus old baseline | Versus fallback | Fallback / new |
| -------------- | ----: | -----------------: | ----------------: | -----------: | ----------: | ------------------: | --------------: | -------------: |
| js-ts          |  2403 |          746.42 ms |         743.98 ms |    864.72 ms |   497.86 ms |             -33.30% |         -42.43% |         1.737x |
| js-ts-fallback |   462 |          413.43 ms |         418.90 ms |    603.73 ms |   265.23 ms |             -35.85% |         -56.07% |         2.276x |
| supported      |  3439 |         1702.91 ms |        1702.12 ms |   1905.50 ms |  1634.33 ms |              -4.03% |         -14.23% |         1.166x |

### Matched capability: embedded formatting off

This changes configuration on every variant and is separate from the original-config comparison. In the prior POC, turning embedding off already selects SWCFMT for the 462 backtick files. It also disables embedded work in non-JS/TS host files.

| Scope          | Old adapter 3.10.1 | Old adapter 3.9.9 | Fallback POC | No fallback | New vs old | New vs fallback |
| -------------- | -----------------: | ----------------: | -----------: | ----------: | ---------: | --------------: |
| js-ts          |          717.25 ms |         711.57 ms |    503.03 ms |   495.43 ms |    -30.93% |          -1.51% |
| js-ts-fallback |          388.59 ms |         388.54 ms |    268.06 ms |   265.10 ms |    -31.78% |          -1.10% |
| supported      |         1319.83 ms |        1319.52 ms |   1127.75 ms |  1129.58 ms |    -14.41% |          +0.16% |

With matched embedding settings, the old and new official-plugin routes are close: the removal of repeated selection is at most a small effect here, not the source of the large original-config speedup. The comparison against the old adapter still improves at equal capability. No claim attributes the entire original-config difference to the native formatter core.

## Best measured concurrency and independent confirmation

All rows retain the original Rsbuild config. This is the best median among the scanned configurations on this machine/input, not a theoretical limit or universal ranking. Each chosen configuration was independently measured with two new warmups and seven interleaved samples.

| Scope     | Workers | Scan median | Confirmation median (range)  | Old adapter 3.10.1, same workers | Old adapter 3.9.9 | Fallback, same workers | Change vs old | Change vs fallback | Fallback / new |
| --------- | ------: | ----------: | ---------------------------- | -------------------------------: | ----------------: | ---------------------: | ------------: | -----------------: | -------------: |
| js-ts     |      18 |   434.97 ms | 439.04 ms (421.88–478.81)    |                        611.28 ms |         595.26 ms |              731.39 ms |       -28.18% |            -39.97% |         1.666x |
| supported |      12 |  1205.17 ms | 1210.15 ms (1170.10–1241.12) |                       1248.96 ms |        1206.70 ms |             1376.66 ms |        -3.11% |            -12.10% |         1.138x |

For the supported scope at 12 workers, the no-fallback and old adapter/3.9.9 medians are essentially equal (1210.15 vs 1206.70 ms). The larger gain remains against the fallback POC. No hot API timing is mixed with cold-process CLI results. No runtime scheduler change or SWCFMT core optimization was made; only routing/validation changed.

### Complete no-fallback worker scan

| Workers | All JS/TS | Supported scope |
| ------: | --------: | --------------: |
|       1 | 956.90 ms |      3723.68 ms |
|       2 | 648.08 ms |      2251.51 ms |
|       4 | 514.11 ms |      1597.71 ms |
|       6 | 501.26 ms |      1404.68 ms |
|       8 | 460.99 ms |      1319.77 ms |
|      12 | 448.73 ms |      1205.17 ms |
|      18 | 434.97 ms |      1217.31 ms |

[MEASUREMENTS.md](MEASUREMENTS.md) contains all four variants at every worker count, all seven samples, ranges and exits. Raw `results.json` files contain warmups, process/load snapshots, invalid records and exact commands. No valid slow sample was discarded. Three main-matrix samples, one matched-capability sample and seven records from the abandoned scan were rejected due to observed competing tasks or missing inputs; the restarted scan retained one conservative pre-measurement rejection around the other task ending. Exact validity flags in each raw report are authoritative.

## Reproduce

Build the old adapter checkout at `d1efeb3`, fallback POC at `dbf75f4`, and this
checkout, with locked dependencies (`pnpm build`, then
`pnpm --filter rstack build:native`). The existing cause-investigation snapshot
of `dbf75f4` can be reused unchanged. Snapshot the built runtimes, then run:

```sh
python3 benchmarks/swc-next-prettier/no-fallback/prepare.py \
  --before /path/to/old-adapter --fallback /path/to/fallback-poc \
  --after /path/to/this-checkout --output /tmp/no-fallback-variants
python3 benchmarks/swc-next-prettier/no-fallback/sequence.py \
  --variants /tmp/no-fallback-variants/variants.json \
  --rsbuild /path/to/rsbuild --output /tmp/no-fallback-results
```

`before310` is the original adapter/Prettier 3.10.1; `before399` changes only
its Prettier dependency to 3.9.9. `fallback` is the prior POC and `no-fallback`
is the actual source implementation, both on 3.9.9. No plain-Prettier baseline
replaces the original adapter. The snapshot includes bundle hashes and a source
patch hash; the final source implementation is committed as `e3d1c22`. No installation/build/copy/audit time enters the CLI samples.

Each timing cell runs `node <variant>/packages/rstack/bin/rs.js fmt <manifest>
--check --no-cache --parallel-workers <count>` in an isolated Rsbuild archive at
`ad8388c5befec29f5ccf765857faf126c1f05d5d`, retaining config, ignores and
`heading-case`. Explicit sorted manifests match the prior supported inventory:
2403 JS/TS, 462 original fallback JS/TS, 3439 supported files. Import-source is
still excluded equally; that fixture remains unsupported. Each cell has two
warmups and seven interleaved measurements, preserving exits, counts and logs.
The runner supports resuming completed valid cells; it verifies identical
variant metadata, embedding mode and worker counts and restores original input
before continuing. A detector update resumed the current matrix without
discarding valid samples.
`--check` input bytes are verified unchanged. Output writes/idempotence and
independent parser audits run outside timing.

Concurrency is scanned at 1/2/4/6/8/12/18 workers on an 18-core Apple M5 Max
(6 performance + 12 efficiency cores), with all baselines at each concurrency.
The lowest no-fallback median is selected per scope and confirmed with seven new
interleaved samples at the selected worker count. These are cold-process CLI
wall times, not hot API throughput or a theoretical limit. The default worker
policy is unchanged. Separate subset times must not be summed.

The runner defers timing while another build/benchmark is visible, records
process/load state outside timing, and retains/retries samples if it observes
competing work immediately afterward. It does not stop others' tasks. Background
system services remain active. Two early attempts were stopped as the other
Parcel task began compiling: `aborted-competing-build` and
`interrupted-before-scan` preserve partial records and do not contribute to
reported medians. Audit-only runs may overlap compilation and their recorded
wall times are not benchmark results.

## Output and route audit

The [independent audit](audit/ast-audit.json) parses all 2403 JS/TS originals and
each variant's written output with `@swc-next/parser@0.7.0`. No diagnostics or
normalized AST/comment mismatches were found. Normalization removes positions,
raw literal spelling and explicit parentheses, but **retains tagged-template
raw values**. Detailed records are retained for changed or problematic files;
unchanged passing files are counted. This is structural evidence, not an
execution-equivalence proof. Rsbuild's runtime suite was not run.

Old-adapter outputs are unchanged, fallback changes six files, and no-fallback
changes 17 files (11 additional files). Differences concern chains, wrapping,
TypeScript assertions and arrows; template contents are unchanged on this
input. All 3439 supported files write successfully and pass a second check.
The [output diffs](audit/js-ts-no-fallback.diff) and per-variant hashes are
retained. The known import-source file separately fails with exit 2, recorded
in `unsupported.json`; it was not silently returned unchanged.

[Four-worker route traces](trace/summary.json) show:

| Scope                    | Files passed to format | Official JS parser | Official TS parser | Official TSX parser | Built-in Babel/TS calls |
| ------------------------ | ---------------------: | -----------------: | -----------------: | ------------------: | ----------------------: |
| All JS/TS                |                   2403 |                862 |               1451 |                  74 |                       0 |
| Original fallback subset |                    462 |                 40 |                420 |                   2 |                       0 |

All 2387 nonempty top-level JS/TS files call the official parser. The remaining
16 are empty/whitespace-only and Prettier returns before parsing; 2403 is the
selected-route count. All 462 original fallback files are nonempty. The complete
supported scope retains the same 708 built-in Babel and 2428 built-in TypeScript
calls for embedded code in non-JS/TS hosts; special expression parsers also stay
unchanged. Instrumentation is separate from timing and is not used to claim
throughput. It imports/wraps parsers and adds overhead.

Reproduce the audits after the main output checks:

```sh
node benchmarks/swc-next-prettier/no-fallback/audit.mjs \
  /tmp/no-fallback-results/main /path/to/old-adapter
python3 benchmarks/swc-next-prettier/causes/trace.py \
  --variants /tmp/no-fallback-variants/variants.json \
  --matrix /tmp/no-fallback-results/main/results.json \
  --output /tmp/no-fallback-trace --names no-fallback \
  --groups js-ts js-ts-fallback supported
```

Behavior tests explicitly demonstrate that ordinary templates/comments use
SWCFMT, embedded GraphQL stays unformatted, an explicit Babel parser or user
parser plugin restores embedded formatting, unsupported options throw even for
empty files, and import-source errors propagate. Existing CLI Tailwind/Svelte
coverage still passes. `pnpm build`, native build, `pnpm test` (457 passed,
1 skipped), the focused test after adding plugin coverage, `pnpm check`, spelling
and website build passed. Test-generated ignored configs containing local paths
initially tripped spelling; only those two generated configs were removed before
the successful spelling rerun. No snapshots were updated.

Final source checks also found three existing files whose parentheses/wrapping
changed under SWCFMT: `configLayers.ts`, `staged.ts` and `runnerCache.test.ts`.
Only those necessary formatting edits were made. A final rebuild and complete
test rerun passed (457 passed, one skipped). Formatter/worker/pool JavaScript is
byte-identical to the measured snapshot; unrelated app/test lazy configuration
chunks received different build-generated names. `build-parity.json` records
this distinction. Full uncached format, lint/type checking and spelling pass.

One concurrency-scan input directory under the macOS temporary folder lost
tracked files during an external task's cleanup. The next CLI invocation exited
2 with no matched files; this was a harness/environment failure, not unsupported
syntax. `interrupted-input-cleanup` retains the entire partial scan and failure,
which are excluded from reported medians. The complete concurrency scan was
restarted in a fresh `/tmp` directory. The runner now checks every original input
byte before each timing cell (outside timing), in addition to post-batch checks.
The completed main and embedding-off batches had already passed their input and
output checks before this event and remain valid.

Separate selected-concurrency write/idempotence audits are in
`confirm-output-js-ts` (18 workers) and `confirm-output-supported` (12 workers).
All four variants' output hashes match their four-worker original-config
outputs exactly, and every write and second check exits 0. Their audit wall
times are excluded from the confirmation medians. The final `pnpm check`,
full `rs fmt --check --no-cache`, spelling and `git diff --check` pass.
