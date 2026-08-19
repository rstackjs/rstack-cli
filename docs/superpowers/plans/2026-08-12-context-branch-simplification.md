# Context branch simplification implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Reduce the context-engine branch to a simple read-only foundation with an optional
Rsdoctor adapter, while preserving passive build evidence and the single stdio MCP server.

**Architecture:** Remove the premature destructive retention surface. Move duplicated
persisted-record validation into one internal module used by the writer and status reader. Lazy-load
Rsdoctor, validate functional tool inputs, and return its JSON result directly.

**Tech Stack:** TypeScript, Node.js 22+, pnpm, Rstest, Rslint, MCP SDK 1.29.0, Zod 4.4.3,
`@rsdoctor/agent-cli` 0.1.1.

## Global constraints

- Work only on `codex/rstack-mcp-observability`; never rewrite or amend existing commits.
- Follow strict red-green-refactor TDD for every behavior change.
- Keep one local stdio MCP server. Do not add a daemon, HTTP listener, dev-server route, report
  server, build invocation, or startup mutation.
- The Phase 1 MCP surface is read-only: `project_status`, `rsdoctor_analyze`, and `report_link` only.
- Keep only ordinary type/shape validation needed for functional errors and stable data contracts.
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

Mark destructive retention as deferred until real size/access measurements and product semantics
exist. Do not claim cache growth is already bounded by deletion.

- [ ] **Step 5: verify and commit**

Run the focused MCP tests and `pnpm check`; commit as
`refactor(rstack): defer destructive context retention`.

---

### Task 2: unify persisted-record validation

**Files:**

- Create: `packages/rstack/src/context/records.ts`
- Create: `packages/rstack/tests/context/records.test.ts`
- Modify: `packages/rstack/src/context/store.ts`
- Modify: `packages/rstack/src/context/model.ts`
- Modify: `packages/rstack/tests/context/store.test.ts`

**Interfaces:**

- Produces `validateRunManifest(value): ContextRunManifest | undefined`.
- Produces `validateSnapshot(value): ContextSnapshot | undefined`.
- Produces canonical generation filename validation
  `<sequence padded to 10>-<snapshotId>.json`.
- `readLatestSnapshot` sorts canonical generation filenames newest-first and stops after the first
  valid matching snapshot instead of parsing every historical generation.

- [ ] **Step 1: write schema-parity tests**

Cover valid/invalid manifests and snapshots, duplicate manifest context IDs, canonical generation
names, writer/reader acceptance parity, and ordinary JSON parse failure. Verify RED against the
current duplicated validators.

- [ ] **Step 2: implement the shared record module**

Move identifier/path/producer/status/completeness validation out of `store.ts`. Validate the current
model's required primitive/object fields and unique context IDs. Keep the functions internal to the
context implementation rather than exporting them through `context/index.ts`.

- [ ] **Step 3: use shared validation in reads and writes**

Keep the existing straightforward atomic publication and JSON reads. Use the shared validators and
canonical generation-name helper in both paths. Delete the duplicate sets and predicates from
`store.ts`. Remove pre-read byte checks and their model/test surface. Replace the all-generations
parse/sort with a descending filename loop that stops at the latest valid record.

- [ ] **Step 4: verify and commit**

Run record/store/status tests and `pnpm check`; commit as
`refactor(rstack): share context record validation`.

---

### Task 3: reduce passive build extraction work

**Files:**

- Modify: `packages/rstack/src/context/build.ts`
- Modify: `packages/rstack/src/context/workspace.ts`
- Modify: `packages/rstack/src/rsbuildConfig.ts`
- Modify: `packages/rstack/src/rslibConfig.ts`
- Modify: `packages/rstack/tests/context/build.test.ts`
- Modify: `packages/rstack/tests/context/workspace.test.ts`
- Modify: `packages/rstack/tests/context/injection.test.ts`

**Interfaces:**

- `buildMetadataFacet` keeps the existing persisted `BuildMetadataFacet` shape.
- Stats extraction no longer requests unused timings and retains no more than 100 safe assets,
  100 chunks, or 20 safe files per retained chunk while counting dropped safe rows.
- Workspace discovery stops after inspecting the nearest `.git` root instead of selecting an
  unrelated ancestor workspace manifest.
- Rsbuild and Rslib loaders canonicalize an existing loaded config path before observer creation.

- [ ] **Step 1: write high-cardinality extraction tests**

Provide more than 100 valid and invalid assets/chunks and more than 20 chunk files. Assert exact
retained rows and dropped counts, and assert the `toJson` options omit `timings`.

Add ordinary fixtures proving a checkout nested under an unrelated ancestor workspace resolves to
the checkout root and an existing loaded config path produces a normalized workspace-relative
descriptor.

- [ ] **Step 2: verify RED**

Run the focused build test. Expected: current extraction requests timings and allocates/maps all rows.

- [ ] **Step 3: implement one-pass bounded collectors**

Use simple loops with retained arrays and dropped counters. Normalize each candidate once. Preserve
ordering and the public snapshot shape. Stop workspace discovery immediately after processing the
nearest `.git` directory. Canonicalize `loaded.filePath` once in each CLI-specific loader before
passing it to `createBuildContextPlugin`.

- [ ] **Step 4: verify and commit**

Run build/injection tests and `pnpm check`; commit as
`perf(rstack): bound passive build extraction`.

---

### Task 4: simplify and lazy-load the Rsdoctor adapter

**Files:**

- Modify: `packages/rstack/src/context/rsdoctor.ts`
- Modify: `packages/rstack/src/context/mcp.ts`
- Modify: `packages/rstack/src/context/index.ts`
- Modify: `packages/rstack/tests/context/rsdoctor.test.ts`
- Modify: `packages/rstack/tests/context/mcp.test.ts`

**Interfaces:**

- Supported tool names remain exactly the pinned ten-agent catalog names.
- `@rsdoctor/agent-cli` is loaded with dynamic `import()` only on the first analysis request.
- Tool input is validated against the selected catalog entry's JSON schema for functional errors.
- Tool output is returned directly as JSON.

- [ ] **Step 1: rewrite tests for the direct functional contract**

Keep catalog-name, valid-artifact, malformed-JSON, wrong-envelope, and unknown-tool coverage. Add a
real-tool test proving returned strings and fields are unchanged.

- [ ] **Step 2: verify RED**

Run Rsdoctor/MCP tests. Expected: the current adapter still changes fixture values and the package is
still loaded eagerly.

- [ ] **Step 3: simplify the adapter and lazy-load the package**

Resolve the explicit data file with ordinary `path.resolve`, parse JSON, and invoke the selected
pinned catalog tool. Dynamically import the package and cache its catalog/executor on first use.

- [ ] **Step 4: verify startup isolation**

Add a built-process test showing status-only MCP initialization does not load
`@rsdoctor/agent-cli`, while one `rsdoctor_analyze` call does.

- [ ] **Step 5: verify and commit**

Run Rsdoctor/MCP tests and `pnpm check`; commit as
`refactor(rstack): simplify Rsdoctor analysis`.

---

### Task 5: simplify report lookup and align documentation

**Files:**

- Modify: `packages/rstack/src/context/rsdoctor.ts`
- Modify: `packages/rstack/src/context/report.ts`
- Modify: `packages/rstack/tests/context/report.test.ts`
- Modify: `website/docs/en/guide/cli/mcp.mdx`
- Modify: `website/docs/zh/guide/cli/mcp.mdx`
- Modify: `docs/rfcs/0001-rstack-context-engine.md`

**Interfaces:**

- Report lookup returns a discriminated `missing | file` result instead of requiring callers to
  inspect exception messages.
- Report links use ordinary resolved file URIs; no server or command is started.

- [ ] **Step 1: write typed-outcome report tests and verify RED**

Cover missing conventional report, one valid sibling, ambiguous siblings, and manifest fallback.
Assert no control flow depends on an exception message.

- [ ] **Step 2: implement the typed boundary**

Use ordinary resolved paths and `stat` to return discriminated outcomes. The report resolver owns
file lookup directly and consumes typed outcomes.

- [ ] **Step 3: align English, Chinese, and RFC status**

Document the exact three-tool Phase 1 surface, direct Rsdoctor JSON contract, optional GUI links, and
deferred retention. Update both planning documents to match the implemented functional contract.

- [ ] **Step 4: run full verification and commit**

Run `pnpm check`, `pnpm check:spell`, `pnpm build`,
`pnpm --filter rstack build:native`, and `pnpm test`; commit as
`docs: align the lean context foundation`.
