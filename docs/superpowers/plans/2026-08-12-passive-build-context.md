# Passive build context implementation plan

<!-- cspell:ignore modelcontextprotocol -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Publish opt-in, metadata-only Rsbuild and Rslib build observations into the checkout-local
immutable store and expose all package contexts through one read-only `rs mcp` status tool.

**Architecture:** The CLI-specific config loaders shallow-clone resolved user configs and append one
per-instance Rsbuild observer. Producers write immutable per-environment snapshots; a root-launched
stdio MCP process reads and projects them on demand. There is no daemon, port, task-runner adapter,
or producer-to-MCP connection.

**Tech stack:** TypeScript, Node.js 22+, Rstack config loaders, Rsbuild plugin hooks, Rspack Stats,
Rstest, `@modelcontextprotocol/sdk@1.29.0`, pnpm catalogs.

## Global constraints

- Work on `codex/rstack-mcp-observability`, never `main` or `master`.
- Follow strict red-green-refactor TDD for every production behavior.
- Preserve the pure `resolveRsbuildConfig` and `resolveRslibConfig` behavior used by Rstest.
- Never mutate user config objects, `lib[]` entries, user plugin arrays, hook arguments, or config files.
- Capture is off unless `define.context({ enabled: true })` or `RSTACK_CONTEXT=1` enables it.
- `RSTACK_CONTEXT=0` and `capture: 'off'` always disable capture.
- Metadata caps are exactly 100 assets, 100 chunks, and 20 files per chunk.
- Persist only checkout-relative POSIX paths; never persist raw config, source, source maps,
  environment values, output contents, or full diagnostic messages.
- Capture failure must never change an Rsbuild or Rslib command result and may warn at most once per
  observer instance.
- One global Rslib observer must cover all generated environments; do not add plugins to `lib[]`.
- `rs mcp` uses stdio only. Stdout is protocol-only; logs go to stderr.
- MCP v1 is pinned to `@modelcontextprotocol/sdk@1.29.0`; do not adopt the just-released v2 split in
  this phase.
- English and Chinese documentation must remain structurally and semantically aligned, with matching
  heading anchors.
- Do not add Rsdoctor, deep Rspack graphs, Rslint, Rstest, retention, subscriptions, HTTP, or mutation
  tools in this plan.

---

### Task 1: add trusted context configuration and project-status projection

**Files:**

- Create: `packages/rstack/src/context/config.ts`
- Create: `packages/rstack/src/context/status.ts`
- Create: `packages/rstack/tests/context/config.test.ts`
- Create: `packages/rstack/tests/context/status.test.ts`
- Modify: `packages/rstack/src/context/model.ts`
- Modify: `packages/rstack/src/context/index.ts`
- Modify: `packages/rstack/src/config.ts`
- Modify: `packages/rstack/src/configExports.ts`

**Interfaces:**

- Produces:
  `type ContextConfig = { enabled?: boolean; capture?: 'off' | 'metadata' | 'deep' }`.
- Produces:
  `resolveContextCapture(config: ContextConfig | undefined, override?: string): 'off' | 'metadata' | 'deep'`.
- Produces: `readProjectStatus(workspaceRoot: string): Promise<ProjectStatus>`.
- `ProjectStatus.contexts` contains every run/context pair; it never coalesces concurrent runs.

- [ ] **Step 1: write activation-policy tests**

Create `packages/rstack/tests/context/config.test.ts` with table-driven assertions equivalent to:

```ts
import { expect, test } from 'rstack/test';
import { resolveContextCapture } from '../../src/context/config.ts';

test('resolves context capture with explicit opt-out precedence', () => {
  expect(resolveContextCapture(undefined, undefined)).toBe('off');
  expect(resolveContextCapture({ enabled: true }, undefined)).toBe('metadata');
  expect(
    resolveContextCapture({ enabled: true, capture: 'deep' }, undefined),
  ).toBe('deep');
  expect(resolveContextCapture({ enabled: true, capture: 'off' }, '1')).toBe(
    'off',
  );
  expect(resolveContextCapture({ enabled: true }, '0')).toBe('off');
  expect(resolveContextCapture(undefined, '1')).toBe('metadata');
});
```

Add a config-loading test proving `define.context(...)` is stored separately from `define.app` and
`define.lib` and does not alter either object.

- [ ] **Step 2: run the activation tests and verify RED**

Run:

```bash
pnpm --filter rstack test -- tests/context/config.test.ts
```

Expected: FAIL because `ContextConfig`, `define.context`, and `resolveContextCapture` do not exist.

- [ ] **Step 3: implement the configuration contract**

In `context/config.ts`, implement this precedence exactly:

```ts
const resolveContextCapture = (
  config: ContextConfig | undefined,
  override = process.env.RSTACK_CONTEXT,
): ContextCaptureTier | 'off' => {
  if (override === '0' || config?.capture === 'off') return 'off';
  if (override === '1') return config?.capture === 'deep' ? 'deep' : 'metadata';
  if (config?.enabled !== true) return 'off';
  return config.capture ?? 'metadata';
};
```

Add `context?: ContextConfig` to `Configs`, add `context` to `Define`, add
`context: (config) => setConfig('context', config)` to `define`, and export the public config types
from `configExports.ts`. Do not add context fields to app or library configs.

- [ ] **Step 4: run activation tests and verify GREEN**

Run the Task 1 test command. Expected: all context configuration tests PASS.

- [ ] **Step 5: write project-status tests**

Create stores in temporary standalone and monorepo roots with the existing write helpers. Assert:

- an empty store returns `{ schemaVersion: 1, workspaceId: /^ws_[0-9a-f]{24}$/, contexts: [], issues: [] }`;
- two packages are returned in package/context order;
- two concurrent runs with the same `contextId` remain two entries;
- a context without a snapshot has `state: 'pending'`;
- no returned value contains the absolute temporary root.

- [ ] **Step 6: run project-status tests and verify RED**

Run:

```bash
pnpm --filter rstack test -- tests/context/status.test.ts
```

Expected: FAIL because `readProjectStatus` and `ProjectStatus` do not exist.

- [ ] **Step 7: implement deterministic status projection**

Add these model contracts:

```ts
type ProjectContextStatus = {
  runId: string;
  producer: ContextProducer;
  context: ContextDescriptor;
  state: 'ready' | 'pending';
  latestSnapshot?: ContextSnapshot;
};

type ProjectStatus = {
  schemaVersion: typeof contextStoreSchemaVersion;
  workspaceId: string;
  contexts: ProjectContextStatus[];
  issues: ContextStoreIssue[];
};
```

Implement `readProjectStatus` by calling `readContextWorkspaceStatus`, flattening every run/context
pair, and sorting by package root, product, environment, run start time, then run ID. Compute
`workspaceId` as `ws_` plus the first 24 hex characters of SHA-256 over the canonical real path of
the workspace root. Do not return the root itself.

- [ ] **Step 8: run Task 1 tests and static checks**

Run:

```bash
pnpm --filter rstack test -- tests/context/config.test.ts tests/context/status.test.ts
pnpm check
```

Expected: PASS with zero lint, type, and formatting errors.

- [ ] **Step 9: commit Task 1**

```bash
git add packages/rstack/src/config.ts packages/rstack/src/configExports.ts packages/rstack/src/context packages/rstack/tests/context
git commit -m "feat(rstack): add context activation and status"
```

---

### Task 2: implement the bounded passive build observer

**Files:**

- Create: `packages/rstack/src/context/build.ts`
- Create: `packages/rstack/tests/context/build.test.ts`
- Modify: `packages/rstack/src/context/index.ts`
- Modify: `packages/rstack/src/context/model.ts`

**Interfaces:**

- Consumes: `resolveContextWorkspace`, `writeContextRunManifest`, and `writeContextSnapshot`.
- Produces:
  `createBuildContextPlugin(options: BuildContextPluginOptions): RsbuildPlugin`.
- Produces:
  `appendBuildContextPlugin<T extends { plugins?: RsbuildConfig['plugins'] }>(config: T, plugin: RsbuildPlugin): T`.
- `BuildContextPluginOptions.producer` is only `'rsbuild' | 'rslib'`; product is only
  `'application' | 'library'`.

- [ ] **Step 1: write immutable append and identity tests**

Assert that `appendBuildContextPlugin`:

- returns a new config and a new top-level plugin array;
- preserves the original config and plugin array byte-for-byte;
- preserves falsy/nested Rsbuild plugin entries;
- appends exactly one observer;
- leaves an Rslib `lib[]` array referentially and structurally unchanged.

Assert the observer produces the same `ctx_<24 hex>` ID for identical normalized inputs and a
different ID when environment, package root, config path, product, command, mode, or target changes.

- [ ] **Step 2: run the tests and verify RED**

Run:

```bash
pnpm --filter rstack test -- tests/context/build.test.ts
```

Expected: FAIL because the build observer module does not exist.

- [ ] **Step 3: implement immutable append and observer identity**

Use this option contract:

```ts
type BuildContextPluginOptions = {
  producer: 'rsbuild' | 'rslib';
  product: 'application' | 'library';
  capture: 'metadata' | 'deep';
  workspace: ResolvedContextWorkspace;
  configPath?: string;
  params: ConfigParams;
  createRunId?: () => string;
  now?: () => Date;
};
```

Default run IDs to `run_<Date.now()>_<randomUUID()>`. Normalize package/config paths through
`path.relative(workspaceRoot, value).split(path.sep).join('/')`; reject any escaping result before
publishing. Derive context IDs from the exact identity tuple specified in the design document.

- [ ] **Step 4: write lifecycle and bounds tests**

Use a minimal fake plugin API that only records callbacks registered through
`onBeforeBuild`, `onBeforeDevCompile`, and `onAfterEnvironmentCompile`. Drive those callbacks with two
environment objects and temporary real stores. Assert:

- the first aggregate before hook publishes one run manifest containing both contexts;
- repeated before hooks do not replace or duplicate the immutable manifest;
- environment-local sequences advance `1`, `2` across watch cycles;
- one environment does not advance another environment's sequence;
- 101 assets stores 100 and reports `truncated.assets === 1`;
- 101 chunks stores 100 and reports `truncated.chunks === 1`;
- 21 files in one chunk stores 20;
- `stats.hasErrors()` maps to `fail`, missing Stats maps to `error` and partial completeness;
- deep requests record `deep: 'unsupported'`, metadata records `deep: 'disabled'`;
- absolute asset and chunk paths are not persisted;
- a throwing Stats serializer does not reject the hook and warns once across repeated failures.

- [ ] **Step 5: run lifecycle tests and verify RED**

Run the Task 2 test command. Expected: the new lifecycle cases FAIL before hook implementation.

- [ ] **Step 6: implement the observer hooks**

Register the same `ensureRun` callback with `onBeforeBuild` and `onBeforeDevCompile`. It creates all
descriptors from the aggregate environment map and awaits one manifest publication promise.

Register `onAfterEnvironmentCompile` to serialize immediately with:

```ts
stats.toJson({
  all: false,
  hash: true,
  timings: true,
  assets: true,
  chunks: true,
  errors: false,
  warnings: false,
});
```

Use `stats.hasErrors()` / `stats.hasWarnings()` only for status and the `hasErrors` / `hasWarnings`
booleans. Do not manufacture diagnostic counts when detailed arrays are disabled. Serialize the
`BuildMetadataFacet` from the design, apply all caps, publish one snapshot, and never retain Stats or
environment objects after the callback.

Wrap every callback in one failure guard. Call `api.logger.warn` only on the first capture failure for
the plugin instance, then resolve normally.

- [ ] **Step 7: run Task 2 tests and static checks**

Run:

```bash
pnpm --filter rstack test -- tests/context/build.test.ts tests/context/store.test.ts
pnpm check
```

Expected: PASS with no capture exception escaping the tests.

- [ ] **Step 8: commit Task 2**

```bash
git add packages/rstack/src/context packages/rstack/tests/context/build.test.ts
git commit -m "feat(rstack): collect passive build metadata"
```

---

### Task 3: inject observers through only the CLI-specific loaders

**Files:**

- Create: `packages/rstack/tests/context/injection.test.ts`
- Modify: `packages/rstack/src/rsbuildConfig.ts`
- Modify: `packages/rstack/src/rslibConfig.ts`

**Interfaces:**

- Consumes: `resolveContextCapture`, `resolveContextWorkspace`, `createBuildContextPlugin`, and
  `appendBuildContextPlugin`.
- Preserves the existing default exports and pure resolver semantics.
- Adds named `loadRsbuildConfig` and `loadRslibConfig` exports for focused tests without adding package
  export-map entries.

- [ ] **Step 1: write loader-injection tests**

Test both object and async app/library config definitions through temporary `rstack.config.ts` files
and the existing config-state path override. Let the real loader, resolver, workspace discovery, and
append helper run. Assert:

- disabled context returns the original resolved config with no observer;
- enabled context returns a shallow clone with one trailing `rstack:context-build` plugin;
- user plugins stay in original order and the original array is unchanged;
- app uses producer `rsbuild` and product `application`;
- library uses producer `rslib` and product `library`;
- Rslib `lib[]` remains unchanged;
- `ConfigParams` is passed unmodified to user config functions and observer options;
- the actual `filePath` is the workspace-discovery start path;
- `RSTACK_CONTEXT=0` prevents injection;
- importing/calling the pure resolvers alone never injects capture.

- [ ] **Step 2: run injection tests and verify RED**

Run:

```bash
pnpm --filter rstack test -- tests/context/injection.test.ts
```

Expected: enabled cases FAIL because loaders do not inject observers.

- [ ] **Step 3: implement CLI-only injection**

Keep this order in both loaders:

```ts
const loaded = await loadRstackConfig();
const config = await resolveToolConfig(loaded.configs, params);
const capture = resolveContextCapture(loaded.configs.context);
if (capture === 'off') return config;
const startPath = loaded.filePath ?? process.cwd();
const workspace = await resolveContextWorkspace(startPath);
return appendBuildContextPlugin(
  config,
  createBuildContextPlugin({ producer, product, capture, workspace, configPath: loaded.filePath ?? undefined, params }),
);
```

Rsbuild must retain its existing config watch-file injection. Append the context plugin without
dropping or reordering those watch settings. Rslib must append only to top-level `plugins`.

- [ ] **Step 4: run loader and existing config tests**

Run:

```bash
pnpm --filter rstack test -- tests/context/injection.test.ts tests/config
pnpm check
```

Expected: PASS, including existing app/lib/Rstest extension behavior.

- [ ] **Step 5: commit Task 3**

```bash
git add packages/rstack/src/rsbuildConfig.ts packages/rstack/src/rslibConfig.ts packages/rstack/tests/context/injection.test.ts
git commit -m "feat(rstack): inject build context observers"
```

---

### Task 4: expose project status through one read-only stdio MCP server

**Files:**

- Create: `packages/rstack/src/context/mcp.ts`
- Create: `packages/rstack/src/mcp.ts`
- Create: `packages/rstack/tests/context/mcp.test.ts`
- Create: `website/docs/en/guide/cli/mcp.mdx`
- Create: `website/docs/zh/guide/cli/mcp.mdx`
- Modify: `packages/rstack/src/cli/commands.ts`
- Modify: `packages/rstack/tests/cli/help.test.ts`
- Modify: `packages/rstack/tests/cli/__snapshots__/help.test.ts.snap`
- Modify: `packages/rstack/rslib.config.ts`
- Modify: `packages/rstack/package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `website/docs/en/guide/configuration.mdx`
- Modify: `website/docs/zh/guide/configuration.mdx`
- Modify: `docs/rfcs/0001-rstack-context-engine.md`

**Interfaces:**

- Consumes: `resolveContextWorkspace` and `readProjectStatus`.
- Produces: `createContextMcpServer(workspaceRoot: string): McpServer`.
- Produces: `runContextMcpServer(startPath: string): Promise<void>`.
- CLI command: `rs mcp` and `rs mcp --help`.

- [ ] **Step 1: add the pinned SDK dependency**

Add this catalog entry:

```yaml
'@modelcontextprotocol/sdk': '1.29.0'
```

Add `"@modelcontextprotocol/sdk": "catalog:"` to `packages/rstack` dependencies and run:

```bash
pnpm install
```

Expected: lockfile resolves exactly `1.29.0`; do not add v2 packages.

- [ ] **Step 2: write in-process MCP tests and verify RED**

Use `Client` and `InMemoryTransport.createLinkedPair()` from the pinned SDK. Connect a server created
with a temporary workspace, then assert:

- `listTools()` returns exactly `project_status` for this slice;
- its annotations are read-only, non-destructive, and closed-world;
- `callTool({ name: 'project_status', arguments: {} })` returns the current status;
- a second call sees a snapshot written after the first call, proving no startup-only cache;
- an empty store returns a valid empty status;
- returned content contains no absolute temporary path.

Run:

```bash
pnpm --filter rstack test -- tests/context/mcp.test.ts
```

Expected: FAIL because the MCP module does not exist.

- [ ] **Step 3: implement the MCP server**

Use:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```

Register exactly one no-argument tool:

```ts
server.registerTool(
  'project_status',
  {
    title: 'Rstack project status',
    description:
      'Return checkout-local Rstack build contexts and their latest completed observations.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async () => {
    const status = await readProjectStatus(workspaceRoot);
    return {
      content: [{ type: 'text', text: renderProjectStatus(status) }],
      structuredContent: status,
    };
  },
);
```

Server instructions must state that evidence is read-only, checkout-local, potentially partial, and
never proof that unobserved code is dead. `runContextMcpServer` connects a `StdioServerTransport`.
Do not print to stdout.

- [ ] **Step 4: implement the CLI command and help**

Add an `mcp` Rslib entry pointing to `src/mcp.ts`. Add `mcp` to root help. `rs mcp --help` prints:

```text
Usage:
  $ rs mcp

Start the local Rstack MCP server over stdio
```

Reject positionals and unknown options. With no arguments, dynamically import `../mcp.ts` and await
`runContextMcpServer(process.cwd())`. Keep the import lazy so ordinary CLI startup does not load the
SDK.

- [ ] **Step 5: run MCP and CLI tests**

Run:

```bash
pnpm --filter rstack test -- tests/context/mcp.test.ts tests/cli/help.test.ts
pnpm --filter rstack build
```

Expected: MCP tests PASS, help snapshots PASS, and declaration generation succeeds.

- [ ] **Step 6: document configuration and the CLI in English and Chinese**

Add matching `mcp.mdx` pages with headings `usage`, `capture-build-context`, `monorepos`, and
`limitations`; give translated headings explicit English anchors in Chinese. Document:

- one root MCP process reads all package runs;
- producers do not connect to the MCP process;
- `define.context({ enabled: true, capture: 'metadata' })` and environment overrides;
- Rslib-only, Rsbuild-only, and mixed repositories;
- no Turbo/Nx/daemon requirement;
- Phase 1A exposes status only and does not prove dead code.

Add aligned `define.context` sections to both configuration guides. Update the RFC delivery plan to
label Phase 1A/1B/1C exactly as the design document does.

- [ ] **Step 7: run documentation and repository checks**

Run:

```bash
pnpm check
pnpm check:spell
pnpm build
pnpm --filter rstack build:native
pnpm test
```

Expected: zero lint/type/format/spelling/heading errors; both builds pass; every test passes except
intentional repository skips.

- [ ] **Step 8: commit Task 4**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/rstack website/docs docs/rfcs/0001-rstack-context-engine.md
git commit -m "feat(rstack): expose build context over MCP"
```
