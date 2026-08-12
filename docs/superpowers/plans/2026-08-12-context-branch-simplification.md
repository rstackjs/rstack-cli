# Context Branch Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Reduce the context-engine branch to a bounded, read-only foundation with a narrow optional
Rsdoctor adapter, while preserving passive build evidence and the single stdio MCP server.

**Architecture:** Remove the premature destructive retention surface instead of hardening it further.
Move persisted-record validation and safe file access into one internal boundary used by the writer and
status reader. Keep MCP responses as small projections. Lazy-load Rsdoctor and validate/project each
supported catalog tool instead of recursively filtering arbitrary output with a denylist.

**Tech Stack:** TypeScript, Node.js 22+, pnpm, Rstest, Rslint, MCP SDK 1.29.0, Zod 4.4.3,
`@rsdoctor/agent-cli` 0.1.1.

## Global Constraints

- Work only on `codex/rstack-mcp-observability`; never rewrite or amend existing commits.
- Follow strict red-green-refactor TDD for every behavior change.
- Keep one local stdio MCP server. Do not add a daemon, HTTP listener, dev-server route, report
  server, build invocation, or startup mutation.
- The Phase 1 MCP surface is read-only: `project_status`, `rsdoctor_analyze`, and `report_link` only.
- Treat persisted records and Rsdoctor artifacts as untrusted checkout-local input.
- No response may exceed 1 MiB. All paths returned to callers are checkout-relative POSIX paths.
- Keep English and Chinese documentation aligned in structure, meaning, examples, and anchors.
- Prefer deletion and shared validation over new wrappers. Do not preserve an abstraction solely
  because earlier commits introduced it.

---

### Task 1: remove premature destructive retention

**Files:**

- Delete: `packages/rstack/src/context/retention.ts`
- Delete: `packages/rstack/tests/context/retention.test.ts`
- Modify: `packages/rstack/src/context/index.ts`
- Modify: `packages/rstack/src/context/mcp.ts`
- Modify: `packages/rstack/tests/context/mcp.test.ts`
- Modify: `docs/superpowers/plans/2026-08-12-rsdoctor-context.md`
- Modify: `docs/rfcs/0001-rstack-context-engine.md`

**Interfaces:**

- Removes `planContextRetention`, `applyContextRetention`, `context_prune`, and their policy/result
  types.
- Leaves exactly the three Phase 1 MCP tools named in the global constraints.

- [ ] **Step 1: make MCP tests expect the lean surface**

Change the protocol test to assert the exact three-tool set and remove retention calls. Add a
negative assertion that `context_prune` is not advertised.

- [ ] **Step 2: verify RED**

Run `pnpm --filter rstack test -- packages/rstack/tests/context/mcp.test.ts`. Expected: the existing
server still advertises `context_prune`.

- [ ] **Step 3: delete the retention implementation and wiring**

Remove the two files, imports, schemas, response helpers, tool registration, and barrel exports. Do
not replace them with another deletion mechanism.

- [ ] **Step 4: correct the design record**

Mark destructive retention as deferred until real size/access measurements and a portable recovery
contract exist. Keep bounded reads/writes as current work; do not claim cache growth is already
bounded by deletion.

- [ ] **Step 5: verify and commit**

Run the focused MCP tests and `pnpm check`; commit as
`refactor(rstack): defer destructive context retention`.

---

### Task 2: unify and bound the persisted-record boundary

**Files:**

- Create: `packages/rstack/src/context/records.ts`
- Create: `packages/rstack/tests/context/records.test.ts`
- Modify: `packages/rstack/src/context/store.ts`
- Modify: `packages/rstack/src/context/model.ts`
- Modify: `packages/rstack/src/context/status.ts`
- Modify: `packages/rstack/src/context/mcp.ts`
- Modify: `packages/rstack/tests/context/store.test.ts`
- Modify: `packages/rstack/tests/context/status.test.ts`
- Modify: `packages/rstack/tests/context/mcp.test.ts`

**Interfaces:**

- Produces `validateRunManifest(value): ContextRunManifest | undefined`.
- Produces `validateSnapshot(value): ContextSnapshot | undefined`.
- Produces `readImmutableJsonFile(path, budget): Promise<unknown | undefined>` using
  `O_NOFOLLOW`, a file handle, pre/post identity and size checks, and the existing 1 MiB record cap.
- Produces canonical generation filename validation
  `<sequence padded to 10>-<snapshotId>.json`.
- `ContextWorkspaceStatus` and `ProjectStatus` add
  `truncated: { runs: number; contexts: number; generations: number }`.

- [ ] **Step 1: write schema-parity and handle-bound I/O tests**

Cover duplicate manifest context IDs, noncanonical generation names, record symlinks, symlinked
store parents, record replacement between open/stat/read, oversized records, and writer/reader
acceptance parity. Verify RED against the current duplicated validators and pathname reads.

- [ ] **Step 2: implement the shared record module**

Move identifier/path/producer/status/completeness validation out of `store.ts`. Validate finite
numbers and ISO date strings, bound descriptor strings to 4 KiB, bound contexts per manifest to 64,
and accept only object-valued facets whose persisted record remains within 1 MiB. Keep functions
internal to the context implementation rather than exporting them through `context/index.ts`.

- [ ] **Step 3: make publication refuse symlinked store components**

Create `.rstack`, `cache`, `context-v1`, and `runs` one component at a time. For every existing or
created component, require `lstat().isDirectory()`, reject symlinks, compare `realpath`, and require
containment by the canonical workspace. On failure return the existing fail-soft
`{ written:false }` result and never write outside the workspace cache.

- [ ] **Step 4: add bounded status scanning and projection**

Scan at most 64 direct runs, 64 contexts per manifest, and 256 generation entries per context, with
an aggregate 16 MiB read budget. Select only canonical files. Return the latest valid snapshot, but
project `facets` to a validated `build` facet only; drop unknown facets. Record skipped counts in the
new `truncated` fields and bounded issues rather than returning raw data.

- [ ] **Step 5: cap MCP status serialization**

Serialize once. If the projected status still exceeds 1 MiB, return an MCP error with no partial raw
payload. Do not duplicate the full object in two separately generated serializations.

- [ ] **Step 6: verify and commit**

Run record/store/status/MCP tests and `pnpm check`; commit as
`fix(rstack): bound context store status`.

---

### Task 3: reduce passive build extraction work

**Files:**

- Modify: `packages/rstack/src/context/build.ts`
- Modify: `packages/rstack/tests/context/build.test.ts`

**Interfaces:**

- `buildMetadataFacet` keeps the existing persisted `BuildMetadataFacet` shape.
- Stats extraction no longer requests unused timings and retains no more than 100 safe assets,
  100 chunks, or 20 safe files per retained chunk while counting dropped safe rows.

- [ ] **Step 1: write high-cardinality extraction tests**

Provide more than 100 valid and invalid assets/chunks and more than 20 chunk files. Assert exact
retained rows and dropped counts, and assert the `toJson` options omit `timings`.

- [ ] **Step 2: verify RED**

Run the focused build test. Expected: current extraction requests timings and allocates/maps all rows.

- [ ] **Step 3: implement one-pass bounded collectors**

Use simple loops with retained arrays and dropped counters. Normalize each candidate once. Preserve
ordering and the public snapshot shape.

- [ ] **Step 4: verify and commit**

Run build/injection tests and `pnpm check`; commit as
`perf(rstack): bound passive build extraction`.

---

### Task 4: replace generic Rsdoctor filtering with a narrow lazy adapter

**Files:**

- Create: `packages/rstack/src/context/rsdoctorCatalog.ts`
- Modify: `packages/rstack/src/context/rsdoctor.ts`
- Modify: `packages/rstack/src/context/mcp.ts`
- Modify: `packages/rstack/src/context/index.ts`
- Modify: `packages/rstack/tests/context/rsdoctor.test.ts`
- Modify: `packages/rstack/tests/context/mcp.test.ts`

**Interfaces:**

- Supported tool names are the pinned ten-agent catalog names, but every name has a local strict
  input schema and output projector.
- `@rsdoctor/agent-cli` is loaded with dynamic `import()` only on the first analysis request.
- Projectors return only finite numbers, booleans, bounded identifiers/package names, relative paths,
  known enum-like status/category/code fields, and bounded arrays. Unknown keys and raw
  configuration/environment/source/message text are omitted.
- Maximum projected depth is 8, nodes 10,000, string length 4 KiB, and serialized result 1 MiB.

- [ ] **Step 1: capture pinned catalog fixtures and write contract tests**

Use the public root API to execute every supported tool against bounded fixtures. Assert each input
schema rejects unknown keys and out-of-range pagination, including page size greater than 1000.
Assert outputs contain no absolute paths, raw configuration/environment/source fields, or arbitrary
unknown keys.

- [ ] **Step 2: verify RED**

Run Rsdoctor/MCP tests. Expected: generic `Record<string, unknown>` input and denylist-cloned output
accept cases the new contract rejects.

- [ ] **Step 3: implement the catalog adapter and lazy load**

Keep the ten external tool names unchanged. Use a discriminated request parser keyed by `toolName`.
Delete tokenized sensitive-key heuristics and the eager catalog/executor initialization. The MCP tool
validates through this adapter and returns the projected local result only.

- [ ] **Step 4: verify startup isolation**

Add a built-process test showing status-only MCP initialization does not load
`@rsdoctor/agent-cli`, while one `rsdoctor_analyze` call does.

- [ ] **Step 5: verify and commit**

Run Rsdoctor/MCP tests and `pnpm check`; commit as
`refactor(rstack): narrow Rsdoctor analysis`.

---

### Task 5: type contained report lookup and align documentation

**Files:**

- Modify: `packages/rstack/src/context/rsdoctor.ts`
- Modify: `packages/rstack/src/context/report.ts`
- Modify: `packages/rstack/tests/context/report.test.ts`
- Modify: `website/docs/en/guide/cli/mcp.mdx`
- Modify: `website/docs/zh/guide/cli/mcp.mdx`
- Modify: `docs/rfcs/0001-rstack-context-engine.md`

**Interfaces:**

- Contained lookup returns a discriminated `missing | file | invalid` result instead of requiring
  callers to inspect exception messages.
- Report links remain contained file URIs; no server or command is started.

- [ ] **Step 1: write typed-outcome report tests and verify RED**

Cover missing conventional report, invalid/symlink report, one valid sibling, ambiguous siblings,
and manifest fallback. Assert no control flow depends on an exception message.

- [ ] **Step 2: implement the typed boundary**

Open/validate contained files through the shared no-follow record/file helper where applicable and
return discriminated outcomes. Delete the closure-bearing artifact report resolver and exception-text
matching.

- [ ] **Step 3: align English, Chinese, and RFC status**

Document the exact three-tool Phase 1 surface, bounded/projected status, narrow Rsdoctor contract,
optional GUI links, and deferred retention. Remove any claim that arbitrary catalog JSON is returned
or deletion is available.

- [ ] **Step 4: run full verification and commit**

Run `pnpm check`, `pnpm check:spell`, `pnpm build`,
`pnpm --filter rstack build:native`, and `pnpm test`; commit as
`docs: align the lean context foundation`.
