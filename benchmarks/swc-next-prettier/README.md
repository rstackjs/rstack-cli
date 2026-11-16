# SWC Next formatter POC: Rsbuild CLI benchmark

This POC replaces the local SWC Next parser/ESTree adapter with the published
`@swc-next/formatter-prettier-plugin@0.7.0`. On this machine and input, the
migration is slower overall and does not yet format the complete repository successfully.
The follow-up below isolates a faster SWC subset and a slower JS/TS fallback subset.

## Environment and method

- Rsbuild: `ad8388c5befec29f5ccf765857faf126c1f05d5d`, exported with `git archive` into two temporary directories. The source repository was clean and was not modified.
- Before: Rstack `d1efeb312051868b29c7f5077fb021996b4da866`, including its local SWC Next adapter and `@swc-next/parser@0.7.0`.
- After: this POC on that same base, `@swc-next/formatter-prettier-plugin@0.7.0`. The runtime diff SHA-256 is recorded in both result files.
- Apple M5 Max, 18 logical CPUs, 64 GiB RAM, macOS 26.6.2 arm64; Node 24.20.0 and pnpm 12.18.0 for both builds. Node matches the repository's `.node-version` (24).
- The unchanged Rsbuild root `rstack.config.ts` supplies `singleQuote: true`, `sortPackageJson: true`, its ignore patterns, and `heading-case`. Both copies resolve the same `heading-case@2.0.3` package.
- Before uses Prettier 3.10.1 from the baseline lockfile; after uses 3.9.9 to satisfy the published plugin's exact peer. This is an end-to-end migration comparison, not a controlled comparison of the formatter alone.
- Each CLI is built and its native binding installed before timing. Two warmups per variant, then seven samples per variant, alternating before/after and after/before.
- Wall time includes process startup, config loading, discovery, worker startup and formatting. Four workers, `--check --no-cache`; every input byte is verified unchanged after the timed runs. No API-only timings or cache-hit timings are mixed in.

## Results

| Scope                                                        | Files formatted/checked | Before median | After median | Time change | Before / after |
| ------------------------------------------------------------ | ----------------------: | ------------: | -----------: | ----------: | -------------: |
| Complete Rsbuild configuration                               |                   3,440 |   1,771.80 ms |  1,997.31 ms |     +12.73% |         0.887x |
| Exclude the same unsupported import-source fixture from both |                   3,439 |   1,745.30 ms |  1,942.25 ms |     +11.28% |         0.899x |

The complete after runs exit **2**: `formatting import phase at 0..49 is not implemented`
for `e2e/cases/wasm/wasm-source-import/src/index.js`. Their times describe a run
with a formatting error, not successful whole-repository formatting.

In the second scope, before exits **0** and after exits **1** because six files
have formatting differences; no formatting errors occur. `--write`
audit runs outside timing succeed for both variants (exit 0). The fixed exclusion is passed to
both CLIs; no input or configuration is altered to favor one variant.

| Sample | Complete before (ms) | Complete after (ms) | Supported before (ms) | Supported after (ms) |
| ------ | -------------------: | ------------------: | --------------------: | -------------------: |
| 1      |              1771.80 |             2209.89 |               1751.71 |              1938.80 |
| 2      |              1717.60 |             1997.31 |               1744.15 |              1921.49 |
| 3      |              1807.00 |             2006.73 |               1783.50 |              1942.25 |
| 4      |              1667.45 |             1864.00 |               1732.62 |              1906.76 |
| 5      |              1687.52 |             1930.26 |               1745.30 |              2032.67 |
| 6      |              1905.70 |             1917.39 |               1698.06 |              1977.36 |
| 7      |              2206.73 |             2088.99 |               1778.69 |              2013.32 |

## Coverage and output audit

The supported scope discovers 3,544 candidates: 3,439 have an inferred parser,
and 105 unsupported files are skipped by both CLIs. The inventory records every
candidate, extension, inferred parser and selected formatter.

- 1,941 files use the official SWC formatter (56.44% of formatted files).
- 462 JS/TS files use Prettier because they contain a backtick and embedded-language formatting is enabled. This conservative fallback includes ordinary templates and backticks in comments/strings.
- 1,036 other files use Prettier, including Markdown/MDX, styles, HTML/Vue, JSON and YAML. Together with JS/TS fallback, 1,498 files use Prettier.
- `heading-case` only overrides Markdown parsers, so it does not disable SWC for JS/TS. Plugins that override JS/TS parsers, such as Tailwind, select Prettier for compatibility.

There are six changed files, all recorded in `output.diff`. Differences concern
line wrapping, call chains, arrays, and parentheses around TypeScript assertions.
Both outputs parse without diagnostics; ASTs match after removing source
locations, raw spelling, `extra` and explicit parenthesis nodes, and comments
match. This is structural evidence, not a full execution-equivalence proof.
Both formatted copies pass a subsequent `--check --no-cache` in the supported scope, confirming idempotence. No Rsbuild build or runtime test suite was run against the formatted copies.

Raw timings, stdout/stderr, exit codes, hashes, and output differences are in
`results/` and `results-supported/`. `results-supported/audit.json` and
`inventory.tsv` contain the detailed audit. These results are one local run on
one repository and do not establish a general performance ranking.

## Follow-up: separate language groups

**All JS/TS is still slower (+17.94%), but the subset that actually uses SWC is
faster (-21.88%, 1.280x).** The 462-file fallback subset is slower (+43.19%).
Other languages are also slower (+9.36%); they are not hiding an overall JS/TS
speedup on this input. The results point toward the fallback path as a candidate
for further investigation. They do not isolate native formatter cost from CLI,
plugin loading, parser selection or the required Prettier version change.

| Group                                | Files | Before median | After median | Time change | Before / after |
| ------------------------------------ | ----: | ------------: | -----------: | ----------: | -------------: |
| All JS/TS                            | 2,403 |     766.76 ms |    904.34 ms |     +17.94% |         0.848x |
| Other supported languages            | 1,036 |    1189.27 ms |   1300.61 ms |      +9.36% |         0.914x |
| JS/TS using SWC after migration      | 1,941 |     552.10 ms |    431.29 ms |     -21.88% |         1.280x |
| JS/TS using Prettier after migration |   462 |     471.64 ms |    675.36 ms |     +43.19% |         0.698x |

Each row compares the **same file list** on both variants. These are separate
CLI invocations selecting subsets, not a modified scheduler. Their startup,
worker initialization and file selection costs overlap; adding the row times
does not predict one whole-repository run. No runtime routing or scheduling
change was made for this experiment. Splitting JS/TS from other files alone
has not demonstrated a scheduler improvement.

### Group definition and method

- Use the existing supported inventory from Rsbuild `ad8388c5befec29f5ccf765857faf126c1f05d5d`, retaining its root config, ignores, plugin and both variants' built artifacts. Both build hashes still match the original experiment; before remains `d1efeb3` and after is `27a2b60`. There is no install or rebuild in the measured commands.
- JS/TS includes supported `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts` and `.cts` files (including declaration files). This input has 878 JavaScript/JSX files and 1,525 TypeScript/TSX files. Markdown code blocks, Vue scripts and other embedded code stay with their host language.
- The 1,036 other-language files comprise 477 Markdown/MDX, 242 CSS/Less/SCSS, 228 JSON, 72 HTML/Vue and 17 YAML files. Unsupported extensions are excluded before creating lists.
- Partition JS/TS by the actual after formatter route: 1,941 SWC files and 462 Prettier fallback files. The same lists are passed to the original SWC Next adapter in before. Fallback is not silently removed from the all-JS/TS result.
- Exclude `e2e/cases/wasm/wasm-source-import/src/index.js` from both sides, as in the earlier supported scope. Its full-repository formatting failure remains unresolved.
- Each list is sorted and supplied as individual CLI path arguments. The original inventory applies directory discovery/ignore rules before list generation; configured ignore rules still apply inside the CLI. This differs from the earlier `fmt .` discovery workload, so absolute times should not be compared directly across those experiments.
- Same Apple M5 Max, Node 24.20.0, pnpm 12.18.0 and four workers. Each group has two warmups and seven alternating before/after measurements. Groups run sequentially. Each sample checks the CLI's processed count against the manifest, and both variants' parser inventories are audited afterward.
- `--check --no-cache` leaves every tracked input byte unchanged. Separate `--write` and subsequent `--check --no-cache` runs verify output and idempotence; unselected files are also checked for accidental writes. All copying, hashing and auditing is outside measured time.

### Samples and output checks

All values are CLI wall time in milliseconds:

| Sample | JS/TS before | JS/TS after | Other before | Other after | SWC subset before | SWC subset after | Fallback before | Fallback after |
| ------ | -----------: | ----------: | -----------: | ----------: | ----------------: | ---------------: | --------------: | -------------: |
| 1      |       764.89 |      935.88 |      1245.73 |     1301.73 |            552.10 |           454.34 |          462.19 |         661.96 |
| 2      |       805.31 |      920.36 |      1254.68 |     1312.53 |            570.36 |           431.29 |          496.23 |         674.90 |
| 3      |       773.93 |      883.43 |      1174.55 |     1300.61 |            543.58 |           427.22 |          475.85 |         675.46 |
| 4      |       775.14 |      896.41 |      1216.49 |     1324.54 |            555.36 |           438.98 |          459.86 |         675.36 |
| 5      |       761.00 |      904.34 |      1189.27 |     1279.19 |            544.90 |           427.48 |          527.33 |         751.11 |
| 6      |       764.70 |      895.58 |      1160.59 |     1269.83 |            551.20 |           421.68 |          471.64 |         720.29 |
| 7      |       766.76 |      913.39 |      1186.63 |     1266.30 |            566.78 |           465.04 |          467.43 |         672.54 |

All before timings exit 0. After exits 1 for all-JS/TS and the SWC subset solely
because the same six files need formatting; other/fallback timings exit 0.
There are no syntax failures or skipped files in any group. Both sides process
exactly the listed counts. Every output-write and final idempotence audit exits 0.
The other and fallback groups produce byte-identical before/after outputs.
The six JS/TS differences are identical to the original output audit, with no
parse diagnostics, matching normalized ASTs and matching comments. No Rsbuild
build or execution-equivalence test was added.

The first all-JS/TS output audit exposed a harness count-regex bug: it did not
recognize `(2403 files, no changes)`. The completed timing samples were retained,
the regex was fixed and output/idempotence audits resumed against unchanged
input. The first audit record retains its original null count; subsequent
verified records have the correct count. No timing samples were discarded.

### Reproduce the groups

From this PR checkout, using the previously built before/after checkouts:

```sh
python3 benchmarks/swc-next-prettier/groups.py \
  --before /path/to/rstack-before --after /path/to/rstack-after \
  --rsbuild /path/to/rsbuild --output /tmp/rsbuild-groups
```

`groups.py` creates the four fixed manifests, calls `bench.py --file-list` for
each, then audits parser coverage and outputs. Existing completed results in
an output directory are reused; choose a new output directory to measure again.
Each CLI command is constructed without a shell as:

```text
[node, /path/to/variant/packages/rstack/bin/rs.js, fmt,
 ...JSON.parse(files.json), --check, --no-cache, --parallel-workers, 4]
```

The manifests are relative to the isolated Rsbuild root. The command prefix and
suffix, versions, build hashes, every warmup/sample, stdout/stderr and exit code
are in each `results-groups/<group>/results.json`. `files.json`, `inventory.tsv`,
`audit.json` and `output.diff` preserve the selection, formatter route and output
evidence. `results-groups/summary.json` provides the four comparisons.

## Reproduce

Create a detached checkout at the before commit and check out this PR separately.
In each Rstack checkout, use its specified pnpm version and run:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm --filter rstack build:native
```

Then, from this PR checkout, run (absolute paths recommended):

```sh
python3 benchmarks/swc-next-prettier/bench.py \
  --before /path/to/rstack-before --after /path/to/rstack-after \
  --rsbuild /path/to/rsbuild --output /tmp/rsbuild-full

python3 benchmarks/swc-next-prettier/bench.py \
  --before /path/to/rstack-before --after /path/to/rstack-after \
  --rsbuild /path/to/rsbuild --output /tmp/rsbuild-supported \
  --exclude e2e/cases/wasm/wasm-source-import/src/index.js

RSBUILD_REPO=/path/to/rsbuild node benchmarks/swc-next-prettier/audit.mjs \
  /path/to/rstack-before /path/to/rstack-after /tmp/rsbuild-supported
```

The timed command in each isolated copy is:

```sh
node /path/to/variant/packages/rstack/bin/rs.js fmt . --check --no-cache --parallel-workers 4
```

The supported run additionally passes the quoted negative glob
`'!e2e/cases/wasm/wasm-source-import/src/index.js'`. Installs, builds, archive
extraction, output writes and AST auditing are outside the timing samples.
