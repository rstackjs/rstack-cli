# Context Branch Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Reduce the context-engine branch to a simple read-only foundation with an optional
Rsdoctor adapter, while preserving passive build evidence and the single stdio MCP server.

**Architecture:** Remove the premature destructive retention surface and the branch-specific security
layer. Move duplicated persisted-record validation into one internal module used by the writer and
status reader. Lazy-load Rsdoctor, validate functional tool inputs, and return its JSON result without
redaction or security projection.

**Tech Stack:** TypeScript, Node.js 22+, pnpm, Rstest, Rslint, MCP SDK 1.29.0, Zod 4.4.3,
`@rsdoctor/agent-cli` 0.1.1.

## Global Constraints

- Work only on `codex/rstack-mcp-observability`; never rewrite or amend existing commits.
- Follow strict red-green-refactor TDD for every behavior change.
- Keep one local stdio MCP server. Do not add a daemon, HTTP listener, dev-server route, report
  server, build invocation, or startup mutation.
- The Phase 1 MCP surface is read-only: `project_status`, `rsdoctor_analyze`, and `report_link` only.
- Do not add a security threat model or security-only implementation/tests/docs. Remove prompt/secret
  redaction, traversal/symlink defenses, adversarial size/graph/log protections, capability/env/network
  hardening, and stale-token/outside-root security cases introduced on this branch.
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
- Removes the branch-added per-record byte limit and `oversized-record` issue variant.

- [ ] **Step 1: write schema-parity tests**

Cover valid/invalid manifests and snapshots, duplicate manifest context IDs, canonical generation
names, writer/reader acceptance parity, and ordinary JSON parse failure. Delete oversized-record and
adversarial filesystem cases. Verify RED against the current duplicated validators.

- [ ] **Step 2: implement the shared record module**

Move identifier/path/producer/status/completeness validation out of `store.ts`. Validate the current
model's required primitive/object fields and unique context IDs. Keep the functions internal to the
context implementation rather than exporting them through `context/index.ts`.

- [ ] **Step 3: use shared validation in reads and writes**

Keep the existing straightforward atomic publication and JSON reads. Use the shared validators and
canonical generation-name helper in both paths. Delete the duplicate sets and predicates from
`store.ts`. Remove pre-read byte checks and their model/test surface.

- [ ] **Step 4: verify and commit**

Run record/store/status tests and `pnpm check`; commit as
`refactor(rstack): share context record validation`.

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

### Task 4: remove Rsdoctor security filtering and lazy-load the adapter

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
- Tool output is returned as JSON without path, environment, configuration, source, prompt, or secret
  filtering and without branch-added artifact/result size caps.

- [ ] **Step 1: rewrite tests for the direct functional contract**

Keep catalog-name, valid-artifact, malformed-JSON, wrong-envelope, and unknown-tool coverage. Delete
absolute/external path, symlink, secret/environment/source redaction, huge-artifact, deep/wide-result,
and response-cap tests. Add a real-tool test proving returned strings and fields are not redacted.

- [ ] **Step 2: verify RED**

Run Rsdoctor/MCP tests. Expected: current output still redacts or removes the fixture's values and the
package is still loaded eagerly.

- [ ] **Step 3: delete security helpers and lazy-load the package**

Delete artifact/result byte caps, path containment/realpath checks, path/secret/environment regexes,
key tokenization, safe-metric exceptions, and recursive sanitization. Resolve the explicit data file
with ordinary `path.resolve`, parse JSON, and invoke the selected pinned catalog tool. Dynamically
import the package and cache its catalog/executor on first use.

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
Delete symlink/path-escape cases and assert no control flow depends on an exception message.

- [ ] **Step 2: implement the typed boundary**

Use ordinary resolved paths and `stat` to return discriminated outcomes. Delete the closure-bearing
artifact report resolver, containment checks, and exception-text matching.

- [ ] **Step 3: align English, Chinese, and RFC status**

Document the exact three-tool Phase 1 surface, direct Rsdoctor JSON contract, optional GUI links, and
deferred retention. Remove the RFC security/privacy and security-validation sections and every
branch-added claim or requirement about prompt injection, secrets, traversal, symlinks, adversarial
sizes/graphs/logs, capability denial, environment/network hardening, or stale-token/outside-root
mutation.

- [ ] **Step 4: run full verification and commit**

Run `pnpm check`, `pnpm check:spell`, `pnpm build`,
`pnpm --filter rstack build:native`, and `pnpm test`; commit as
`docs: align the lean context foundation`.
