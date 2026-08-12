# Rsdoctor context and retention implementation plan

<!-- cspell:ignore modelcontextprotocol rsdoctor -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Complete RFC phases 1B and 1C by adding workspace-bounded static Rsdoctor analysis,
bounded context-store retention, and safe report links behind the existing single Rstack MCP server.

**Architecture:** A narrow adapter dynamically loads pinned `@rsdoctor/agent-cli@0.1.1`, validates
an explicit checkout-local `rsdoctor-data.json`, and invokes only names from the package's public tool
catalog. The MCP remains stateless and stdio-only. Retention is an explicit cache operation with a
dry-run default; it never runs merely because an MCP client connects.

**Tech stack:** TypeScript, Node.js 22+, Rstest, MCP TypeScript SDK 1.29.0,
`@rsdoctor/agent-cli@0.1.1`, immutable context-v1 records.

## Global constraints

- Work on `codex/rstack-mcp-observability`, never `main` or `master`.
- Follow strict red-green-refactor TDD for every production behavior.
- Pin `@rsdoctor/agent-cli` to exactly `0.1.1`; import only public package-root exports.
- Do not use or start the legacy live Rsdoctor MCP server, a report server, a daemon, or a build.
- Every artifact/report path is explicit, realpath-resolved, and contained by the canonical checkout.
- Accept only a regular file named `rsdoctor-data.json`, at most 64 MiB, whose JSON root contains an
  object-valued `data` property.
- Expose only tool names returned by `getToolCatalog()`; cap serialized results at 1 MiB and direct
  callers to filters/pagination when exceeded.
- Treat artifact/report contents as untrusted; never return bundled source, raw configuration,
  environment values, or absolute checkout paths.
- Retention defaults to dry-run and may delete only completed immutable run directories selected by
  an explicit policy. It never follows symlinks or deletes the current context store root.
- Retention policy defaults: keep 40 runs, keep records newer than 14 days, maximum 256 MiB; keep at
  least the newest 10 runs regardless of age/bytes.
- English and Chinese documentation remain aligned in structure, meaning, links, and anchors.

---

### Task 1: add the pinned Rsdoctor adapter and bounded artifact validation

**Files:**

- Create: `packages/rstack/src/context/rsdoctor.ts`
- Create: `packages/rstack/tests/context/rsdoctor.test.ts`
- Modify: `packages/rstack/src/context/index.ts`
- Modify: `packages/rstack/package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `listRsdoctorTools(): RsdoctorToolDescriptor[]`.
- Produces:
  `analyzeRsdoctorArtifact(workspaceRoot: string, request: RsdoctorAnalysisRequest): Promise<RsdoctorAnalysisResult>`.
- `RsdoctorAnalysisRequest = { dataFile: string; toolName: string; input?: Record<string, unknown> }`.
- `RsdoctorAnalysisResult = { toolName: string; dataFile: string; result: JsonValue }`.

- [ ] **Step 1: add the exact dependency and contract test**

Add catalog entry `@rsdoctor/agent-cli: 0.1.1`, add it to Rstack runtime dependencies, install, then
write a test asserting `listRsdoctorTools()` is non-empty, stable-sorted, unique, and contains the ten
catalog names published by version 0.1.1. Assert every descriptor has an object JSON schema.

- [ ] **Step 2: verify RED**

Run `pnpm --filter rstack test -- tests/context/rsdoctor.test.ts`. Expected: module/API missing.

- [ ] **Step 3: implement the catalog adapter**

Import `getToolCatalog` and `createInProcessRsdoctorCliToolExecutor` from the package root. Convert the
catalog to frozen plain descriptors and retain one lazily-created in-process executor per MCP process.
Do not copy or rename Rsdoctor tools.

- [ ] **Step 4: write artifact-boundary tests**

Use temporary workspaces to assert rejection of absolute/external paths, symlink escapes, wrong
filenames, directories, malformed JSON, missing/non-object `data`, oversized files, and unknown tool
names. Assert a valid fixture invokes a real catalog tool and returns a relative POSIX data path.
Assert a result exceeding 1 MiB fails with a bounded-output message.

- [ ] **Step 5: verify RED, implement, and verify GREEN**

Resolve the canonical workspace and candidate with `realpath`, verify containment using
`path.relative`, `lstat` the resolved target, bound bytes before parsing, validate the minimum brief
envelope, execute the catalog tool, recursively convert only JSON-safe values, and enforce the output
cap after serialization. Run the focused tests and `pnpm check`.

- [ ] **Step 6: commit Task 1**

Commit as `feat(rstack): add bounded Rsdoctor analysis`.

---

### Task 2: expose Rsdoctor analysis and report links through the one MCP server

**Files:**

- Create: `packages/rstack/src/context/report.ts`
- Create: `packages/rstack/tests/context/report.test.ts`
- Modify: `packages/rstack/src/context/mcp.ts`
- Modify: `packages/rstack/tests/context/mcp.test.ts`

**Interfaces:**

- Produces:
  `resolveRsdoctorReport(workspaceRoot: string, dataFile: string): Promise<RsdoctorReportResult>`.
- `RsdoctorReportResult` returns the relative data file plus either a contained sibling HTML report,
  a contained normal `.rsdoctor/manifest.json`, or an explicit no-report reason.
- MCP adds `rsdoctor_analyze` and `report_link`; `project_status` remains unchanged.

- [ ] **Step 1: write report resolution tests and verify RED**

Test sibling `report-rsdoctor.html`, custom single sibling HTML, normal manifest, ambiguous HTML,
missing report, symlink escape, and absolute-path redaction.

- [ ] **Step 2: implement the report resolver**

Reuse the artifact boundary helper rather than duplicating containment logic. Return a relative POSIX
path and a `file:` URI only for an existing contained report. Otherwise return a concise reason and
the explicit structured `rsdoctor_analyze` next action; never start a server.

- [ ] **Step 3: write MCP protocol tests and verify RED**

Assert the server lists exactly `project_status`, `rsdoctor_analyze`, and `report_link`; all are
read-only/non-destructive/closed-world. Call `rsdoctor_analyze` against a real fixture, verify unknown
tool/path failures are MCP errors without absolute paths, and verify `report_link` returns a resource
link only for a contained report.

- [ ] **Step 4: implement the tools and verify GREEN**

Use strict Zod input schemas. `rsdoctor_analyze` receives explicit `dataFile`, a catalog tool name,
and optional input. `report_link` receives explicit `dataFile`. Return short text plus object-valued
structured content. Do not register each Rsdoctor catalog item as a separate MCP server/tool.

- [ ] **Step 5: commit Task 2**

Run focused tests and `pnpm check`; commit as `feat(rstack): expose Rsdoctor context tools`.

---

### Task 3: implement explicit bounded context-store retention

**Files:**

- Create: `packages/rstack/src/context/retention.ts`
- Create: `packages/rstack/tests/context/retention.test.ts`
- Modify: `packages/rstack/src/context/index.ts`
- Modify: `packages/rstack/src/context/mcp.ts`
- Modify: `packages/rstack/tests/context/mcp.test.ts`

**Interfaces:**

- Produces:
  `planContextRetention(workspaceRoot: string, policy?: Partial<ContextRetentionPolicy>): Promise<ContextRetentionPlan>`.
- Produces:
  `applyContextRetention(workspaceRoot: string, plan: ContextRetentionPlan): Promise<ContextRetentionResult>`.
- MCP adds non-read-only `context_prune` with `dryRun` defaulting to `true`.

- [ ] **Step 1: write deterministic policy tests and verify RED**

Cover count, age, byte, newest-ten floor, malformed/temp files, concurrent-looking recent runs,
symlink run directories, canonical root containment, and byte-stable plans. Use injected `now` in the
planner rather than sleeping.

- [ ] **Step 2: implement pure planning**

Inspect only direct `runs/<safe-id>` directories with `lstat`; never follow symlinks. A run is
eligible only when its manifest and every generation are valid immutable records and its newest file
is older than one hour. Sort newest first, retain the newest ten, then apply 40-run/14-day/256-MiB
bounds. The plan contains relative run paths and observed manifest digests.

- [ ] **Step 3: write stale-plan/apply tests and verify RED**

Assert dry-run never writes, apply revalidates every relative path and manifest digest, skips changed
or missing runs, deletes only selected run directories, and never deletes the store/runs roots.

- [ ] **Step 4: implement guarded apply and MCP tool**

`context_prune` returns the plan for dry-run. `dryRun:false` is annotated non-read-only,
destructive, closed-world and applies only the just-computed plan in the same request. No automatic
pruning occurs at server startup or status reads.

- [ ] **Step 5: commit Task 3**

Run focused tests and `pnpm check`; commit as `feat(rstack): add bounded context retention`.

---

### Task 4: document and verify phases 1B and 1C

**Files:**

- Modify: `website/docs/en/guide/cli/mcp.mdx`
- Modify: `website/docs/zh/guide/cli/mcp.mdx`
- Modify: `docs/rfcs/0001-rstack-context-engine.md`

- [ ] **Step 1: document the exact trust and lifecycle model**

Document explicit artifact selection, supported catalog names, output/path caps, report-link behavior,
dry-run retention, destructive approval, and the fact that MCP never starts builds/report servers.
Keep EN/ZH headings and examples aligned.

- [ ] **Step 2: mark delivery status honestly**

Mark 1B/1C implemented downstream. Keep upstream Rsdoctor artifact-version/export-usage gaps open and
capability-marked; do not imply Rstack can derive facts absent from the artifact.

- [ ] **Step 3: run full verification and commit**

Run `pnpm check`, `pnpm check:spell`, `pnpm build`, `pnpm --filter rstack build:native`, and
`pnpm test`. Commit as `docs: document Rsdoctor context and retention`.
