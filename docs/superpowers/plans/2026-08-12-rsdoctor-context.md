# Rsdoctor context implementation plan

<!-- cspell:ignore modelcontextprotocol rsdoctor -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Complete RFC phases 1B and 1C by adding static Rsdoctor analysis and report links behind
the existing single Rstack MCP server.

**Architecture:** A narrow adapter dynamically loads pinned `@rsdoctor/agent-cli@0.1.1`, validates
an explicit JSON artifact, and invokes only names from the package's public tool catalog. The MCP
remains stateless and stdio-only.

**Tech stack:** TypeScript, Node.js 22+, Rstest, MCP TypeScript SDK 1.29.0,
`@rsdoctor/agent-cli@0.1.1`, immutable context-v1 records.

## Global constraints

- Work on `codex/rstack-mcp-observability`, never `main` or `master`.
- Follow strict red-green-refactor TDD for every production behavior.
- Pin `@rsdoctor/agent-cli` to exactly `0.1.1`; import only public package-root exports.
- Do not use or start the legacy live Rsdoctor MCP server, a report server, a daemon, or a build.
- Resolve explicit artifact/report paths normally and require artifact JSON to contain an
  object-valued `data` property.
- Expose only the pinned tool names returned by `getToolCatalog()` and return their JSON results
  directly.
- Destructive context-store retention is deferred until real artifact sizes and access patterns are
  measured and a portable recovery contract exists.
- English and Chinese documentation remain aligned in structure, meaning, links, and anchors.

---

### Task 1: add the pinned Rsdoctor adapter and artifact validation

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

Use temporary workspaces to cover unreadable artifacts, malformed JSON, missing/non-object `data`,
invalid tool input, and unknown tool names. Assert a valid fixture invokes a real catalog tool and
returns the requested data path.

- [ ] **Step 5: verify RED, implement, and verify GREEN**

Resolve the candidate with `path.resolve`, read and parse it, validate the minimum brief envelope,
execute the catalog tool, and return its JSON result. Run the focused tests and `pnpm check`.

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
- `RsdoctorReportResult` returns the data file plus either a sibling HTML report, the normal
  `.rsdoctor/manifest.json`, or an explicit no-report reason.
- MCP adds `rsdoctor_analyze` and `report_link`; `project_status` remains unchanged.

- [ ] **Step 1: write report resolution tests and verify RED**

Test sibling `report-rsdoctor.html`, one custom sibling HTML file, the normal manifest, ambiguous
HTML, and a missing report.

- [ ] **Step 2: implement the report resolver**

Return an ordinary resolved path and `file:` URI only for an existing report. Otherwise return a
concise reason and the explicit structured `rsdoctor_analyze` next action; never start a server.

- [ ] **Step 3: write MCP protocol tests and verify RED**

Assert the server lists exactly `project_status`, `rsdoctor_analyze`, and `report_link`. Call
`rsdoctor_analyze` against a real fixture, verify ordinary tool/artifact errors are MCP errors, and
verify `report_link` returns a resource link only for an existing report.

- [ ] **Step 4: implement the tools and verify GREEN**

Use strict Zod input schemas. `rsdoctor_analyze` receives explicit `dataFile`, a catalog tool name,
and optional input. `report_link` receives explicit `dataFile`. Return short text plus object-valued
structured content. Do not register each Rsdoctor catalog item as a separate MCP server/tool.

- [ ] **Step 5: commit Task 2**

Run focused tests and `pnpm check`; commit as `feat(rstack): expose Rsdoctor context tools`.

---

### Task 3: defer destructive context-store retention

Do not ship a deletion API or `context_prune` MCP tool in Phase 1. Continue bounding individual
reads and writes, but do not claim that cache growth is bounded by deletion. Revisit retention only
after real artifact sizes and access patterns are measured and a portable recovery contract exists.

---

### Task 4: document and verify Rsdoctor context tools

**Files:**

- Modify: `website/docs/en/guide/cli/mcp.mdx`
- Modify: `website/docs/zh/guide/cli/mcp.mdx`
- Modify: `docs/rfcs/0001-rstack-context-engine.md`

- [ ] **Step 1: document the exact trust and lifecycle model**

Document explicit artifact selection, supported catalog names, the direct JSON result, report-link
behavior, and the fact that MCP never starts builds/report servers. Keep EN/ZH headings and examples
aligned.

- [ ] **Step 2: mark delivery status honestly**

Mark 1B/1C implemented downstream. Keep upstream Rsdoctor artifact-version/export-usage gaps open;
do not imply Rstack can derive facts absent from the artifact.

- [ ] **Step 3: run full verification and commit**

Run `pnpm check`, `pnpm check:spell`, `pnpm build`, `pnpm --filter rstack build:native`, and
`pnpm test`. Commit as `docs: document Rsdoctor context tools`.
