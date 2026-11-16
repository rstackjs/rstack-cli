# SWC Next formatter POC: Rsbuild CLI benchmark

This POC replaces the local SWC Next parser/ESTree adapter with the published
`@swc-next/formatter-prettier-plugin@0.7.0`. On this machine and input, the
migration is slower and does not yet format the complete repository successfully.

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
