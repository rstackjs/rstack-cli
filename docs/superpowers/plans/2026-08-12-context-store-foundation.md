# Context store foundation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the smallest task-runner-independent foundation that lets Rstack producers running
anywhere in a checkout publish immutable context snapshots for a root-launched MCP process to read.

**Architecture:** Producers resolve their checkout and package identity from their actual config path,
then write bounded, versioned records into `.rstack/cache/context-v1`. Every run owns a unique
directory, so concurrent Rslib, Rsbuild, Rstest, Rslint, Rspack, and Rsdoctor processes do not share a
mutable database. A read-only status API scans only completed records; no daemon, socket, task-runner
integration, or MCP transport is introduced in this foundation.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Rstack project cache, Rstest.

## Global constraints

- Work only on a non-main `codex/` branch.
- Treat MCP CWD as an authorization/discovery start, never as package or build identity.
- Do not depend on Turbo, Nx, pnpm recursive execution, or any other task runner.
- Store only workspace-relative package/config paths in records.
- Use immutable per-run records and atomic publication; readers must ignore temporary files.
- Bound individual records to 1 MiB and report malformed or unsupported records as store issues.
- Cache failures must be observable but must not force a future producer to fail its underlying tool.
- Do not add a CLI command, daemon, MCP server, collector injection, or public package export yet.

---

### Task 1: resolve checkout and package identity

**Files:**

- Create: `packages/rstack/src/context/workspace.ts`
- Create: `packages/rstack/tests/context/workspace.test.ts`

**Interfaces:**

- Consumes: an existing config file or directory path supplied by a producer.
- Produces: `resolveContextWorkspace(startPath): Promise<ResolvedContextWorkspace>` where the result
  contains canonical `workspaceRoot`, `packageRoot`, and optional `packageName`.

- [ ] **Step 1: Write the failing workspace tests**

```ts
test('resolves a package from its config path without using process cwd', async () => {
  const result = await resolveContextWorkspace(configPath);
  expect(result).toEqual({ workspaceRoot, packageRoot, packageName: '@repo/lib' });
});

test('falls back to a standalone package root', async () => {
  const result = await resolveContextWorkspace(configPath);
  expect(result.workspaceRoot).toBe(packageRoot);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter rstack test -- tests/context/workspace.test.ts`

Expected: FAIL because `src/context/workspace.ts` does not exist.

- [ ] **Step 3: Implement the minimal resolver**

Walk canonical ancestors once. Prefer the nearest `pnpm-workspace.yaml`,
`pnpm-workspace.yml`, or `package.json#workspaces`; otherwise use the nearest Git checkout marker,
then the nearest package root, then the start directory. Read the nearest `package.json#name` without
executing project code.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter rstack test -- tests/context/workspace.test.ts`

Expected: PASS with both workspace cases green.

### Task 2: publish and read immutable context records

**Files:**

- Create: `packages/rstack/src/context/model.ts`
- Create: `packages/rstack/src/context/store.ts`
- Create: `packages/rstack/src/context/index.ts`
- Create: `packages/rstack/tests/context/store.test.ts`

**Interfaces:**

- Consumes: the workspace root from Task 1, one `ContextRunManifest`, and immutable
  `ContextSnapshot` records.
- Produces: `writeContextRunManifest`, `writeContextSnapshot`, and
  `readContextWorkspaceStatus`; all schemas use `contextStoreSchemaVersion = 1`.

- [ ] **Step 1: Write the failing store tests**

```ts
test('publishes concurrent run snapshots and reads each latest context', async () => {
  expect(await writeContextRunManifest(rootPath, run)).toMatchObject({ written: true });
  expect(await writeContextSnapshot(rootPath, first)).toMatchObject({ written: true });
  expect(await writeContextSnapshot(rootPath, second)).toMatchObject({ written: true });
  expect(await readContextWorkspaceStatus(rootPath)).toMatchObject({
    runs: [{ run, contexts: [{ context: run.contexts[0], latestSnapshot: second }] }],
  });
});

test('does not replace an immutable record', async () => {
  expect(await writeContextSnapshot(rootPath, first)).toMatchObject({ written: true });
  expect(await writeContextSnapshot(rootPath, replacement)).toMatchObject({ written: false });
});

test('reports malformed completed records without reading temporary files', async () => {
  const status = await readContextWorkspaceStatus(rootPath);
  expect(status.issues).toEqual([
    expect.objectContaining({ code: 'invalid-record', path: expect.any(String) }),
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter rstack test -- tests/context/store.test.ts`

Expected: FAIL because the context model and store do not exist.

- [ ] **Step 3: Implement the minimal immutable store**

Use the existing `ensureProjectCacheDir()` and the layout
`context-v1/runs/<runId>/run.json` plus
`context-v1/runs/<runId>/contexts/<contextId>/generations/<sequence>-<snapshotId>.json`.
Serialize JSON with a trailing newline, reject unsafe IDs and records over 1 MiB, write a unique
same-directory temporary file, and atomically hard-link it into its final immutable name. The reader
must validate schema version and required fields, return stable sorting, and report bounded relative
issue paths.

- [ ] **Step 4: Run both context test files and verify GREEN**

Run: `pnpm --filter rstack test -- tests/context/workspace.test.ts tests/context/store.test.ts`

Expected: PASS with no warnings.

### Task 3: make the lean architecture normative

**Files:**

- Modify: `docs/rfcs/0001-rstack-context-engine.md`

**Interfaces:**

- Consumes: the approved workspace-store architecture and the concrete Task 1/2 contract.
- Produces: an RFC whose diagrams, lifecycle, identity, storage, alternatives, budgets, and delivery
  plan consistently describe a daemon-free version 1.

- [ ] **Step 1: Replace the coordinator diagrams and lifecycle**

Show independent package-local producers atomically publishing into the workspace evidence store and
root-launched Codex/Claude stdio MCP processes reading it. Explain that all MCP instances share the
same immutable cache without sharing process memory.

- [ ] **Step 2: Specify discovery and identity**

Distinguish stable repository identity from checkout/worktree identity. State that resolved config,
package root, tool, product, environment, run, and generation identify observations; CWD never does.

- [ ] **Step 3: Update development mode, alternatives, and delivery phases**

Keep build, Rslint, and Rstest independent producers. Explicitly defer a coordinator daemon until
measured multi-client caching or event throughput proves it necessary. Move the workspace store and
status reader into Phase 0.

- [ ] **Step 4: Re-render every Mermaid diagram**

Run the repository Mermaid validation command and render all RFC diagrams in light and dark themes.
Inspect every resulting image for clipped text, invalid edges, unreadable contrast, or misleading
process ownership.

### Task 4: verify and commit the foundation

**Files:**

- Verify all files from Tasks 1-3.

**Interfaces:**

- Consumes: completed implementation and documentation.
- Produces: one reviewed commit on `codex/rstack-mcp-observability`.

- [ ] **Step 1: Format and run focused tests**

Run: `pnpm exec rs fmt packages/rstack/src/context packages/rstack/tests/context docs/rfcs/0001-rstack-context-engine.md docs/superpowers/plans/2026-08-12-context-store-foundation.md`

Run: `pnpm --filter rstack test -- tests/context`

- [ ] **Step 2: Build and run repository checks**

Run: `pnpm --filter rstack build`

Run: `pnpm check`

Run: `pnpm check:spell`

- [ ] **Step 3: Review the final diff and requirements**

Confirm the branch is not `main` or `master`; confirm no daemon, socket, MCP server, task-runner
dependency, config mutation, or public export was added; confirm every stored path is relative and
every completed record is immutable.

- [ ] **Step 4: Commit**

```bash
git add docs/rfcs/0001-rstack-context-engine.md \
  docs/superpowers/plans/2026-08-12-context-store-foundation.md \
  packages/rstack/src/context \
  packages/rstack/tests/context
git commit -m "feat: scaffold context evidence store"
```
