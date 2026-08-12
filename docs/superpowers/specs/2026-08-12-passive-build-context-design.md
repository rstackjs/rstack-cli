# Passive build context design

<!-- cspell:ignore modelcontextprotocol -->

**Status:** Approved for implementation by the request to design and implement the next RFC phase.

**Foundation:** `70c4a90 feat(rstack): scaffold context evidence store`

## Purpose

Deliver the smallest end-to-end Phase 1 slice that proves Rstack commands can publish useful build
metadata from any package in a standalone repository or monorepo, and that one repository-root MCP
process can read all of it without knowing which package launched each command.

The slice covers trusted metadata capture for `rs dev`, `rs build`, and `rs lib`, plus one read-only
`rs mcp` status tool. It deliberately excludes deep compiler graphs and background coordination.

## Chosen approach

Use the existing CLI-specific Rsbuild and Rslib config loaders as the only automatic injection
points. After the user's config resolves, Rstack shallow-clones it and appends one global
Rstack-owned Rsbuild plugin. The plugin publishes immutable per-environment snapshots through the
existing `.rstack/cache/context-v1` store.

`rs mcp` is a local stdio process. It resolves the checkout from its launch path, reads completed
records on demand, and exposes a compact `project_status` tool. It does not listen on a port, own
producer processes, index a task graph, or cache authoritative state.

This is Phase 1A. Phase 1B will add static Rsdoctor ingestion and richer build diagnostics. Phase 1C
will add bounded retention and report links after real artifact sizes and access patterns are
measured.

## Alternatives considered

### Implement all of RFC phase 1 at once

This would combine compiler observation, Rsdoctor schema adaptation, record retention, report
discovery, entity queries, and MCP transport. Those parts have different versioning and failure
modes, making a single review and rollback boundary too large.

### Implement producers without MCP

This is smaller, but it would leave the most important architectural claim untested: an agent host
launched once at the repository root can discover data from independently launched package builds.

### Add a coordinator daemon

A daemon does not solve an observed Phase 1A problem. Immutable producer-owned files already allow
many writers and readers, survive producer restarts, and require no port or process discovery.

## Configuration and trust

Add `define.context` as Rstack-owned configuration, separate from the configuration forwarded to
Rsbuild or Rslib:

```ts
define.context({
  enabled: true,
  capture: 'metadata',
});
```

The supported shape is:

```ts
type ContextConfig = {
  enabled?: boolean;
  capture?: 'off' | 'metadata' | 'deep';
};
```

Rules:

- capture is disabled unless `enabled` is `true` or `RSTACK_CONTEXT=1` is set;
- `RSTACK_CONTEXT=0` always disables capture;
- `capture: 'off'` disables capture even when enabled;
- omitted `capture` means `metadata`;
- `deep` activates metadata capture but records the deep facet as `unsupported` in Phase 1A;
- config objects and config functions are never mutated;
- `define.context` is never forwarded into an underlying tool config.

## Producer architecture

### Injection

`loadRsbuildConfig` and `loadRslibConfig` retain the existing pure resolvers. Their CLI-only loader
paths perform the following steps:

1. load the Rstack config and obtain its actual `filePath`;
2. resolve the app or library config with the original `ConfigParams`;
3. evaluate the context activation policy;
4. resolve checkout and package identity from `filePath`, falling back to the actual launch
   directory only when no config file exists;
5. shallow-clone the resolved config and append exactly one observer to top-level `plugins`.

Rslib `lib[]` entries are never modified. A global plugin observes every Rslib-generated Rsbuild
environment without duplicate global callbacks. Rstest's use of the pure app/library resolvers is
not instrumented.

### Run and context identity

Each plugin instance owns one run and never uses module-global mutable state.

- `runId` is a safe, unique `run_<time>_<uuid>` identifier.
- `contextId` is `ctx_` plus the first 24 hexadecimal characters of SHA-256 over the producer,
  checkout-relative package root, checkout-relative config path, product, environment name,
  command, mode, and target.
- descriptors store only POSIX checkout-relative paths.
- the actual environment name from Rsbuild is authoritative; Rstack does not reproduce Rslib's
  environment-name algorithm.

The run manifest is published once from the first aggregate before-build hook, where the complete
environment map is available. An environment completion hook then publishes monotonically
increasing snapshots for that context. A build watch and a dev server keep one run and advance
environment-local sequences.

### Metadata snapshot

The Phase 1A build facet contains only bounded JSON:

```ts
type BuildMetadataFacet = {
  producer: 'rsbuild' | 'rslib';
  command: string;
  mode?: string;
  environment: string;
  target: string[];
  isWatch: boolean;
  isFirstCompile: boolean;
  durationMs: number;
  hash?: string;
  hasErrors: boolean;
  hasWarnings: boolean;
  assets: Array<{ name: string; size: number }>;
  chunks: Array<{ id?: string; files: string[]; initial?: boolean }>;
  truncated: { assets: number; chunks: number };
};
```

At most 100 assets, 100 chunks, and 20 files per chunk are retained. Asset names and chunk files are
normalized to non-absolute POSIX paths. Source content, source maps, module source, raw config,
environment variables, output contents, and full diagnostic messages are not captured.

Snapshot status is derived from `stats.hasErrors()`: `fail` when true and `pass` otherwise. The
facet stores only `hasErrors` and `hasWarnings` booleans so no diagnostic text or misleading partial
counts cross the observer boundary. Missing
Stats produces `error` with `build: partial`. `deep` completeness is `disabled` for metadata mode and
`unsupported` when deep capture was requested.

### Failure isolation

Every observer callback catches serialization, identity, and store errors. Capture failure never
changes the build result. The plugin emits at most one warning through the Rsbuild logger for a run;
subsequent capture failures remain silent. Store writes keep their existing fail-soft result.

## Status projection

Add a pure projection over `readContextWorkspaceStatus`:

```ts
type ProjectStatus = {
  schemaVersion: 1;
  workspaceId: string;
  contexts: Array<{
    runId: string;
    producer: ContextProducer;
    context: ContextDescriptor;
    state: 'ready' | 'pending';
    latestSnapshot?: ContextSnapshot;
  }>;
  issues: ContextStoreIssue[];
};
```

`workspaceId` is opaque and checkout-specific. The projection returns every run/context pair and
does not silently choose between concurrent runs for the same semantic context. Entries and issues
are deterministically sorted. Absolute workspace paths are not returned.

## MCP and CLI

Add `@modelcontextprotocol/sdk@1.29.0` through the workspace catalog. This stable v1 line avoids the
day-zero v2 package split while the protocol transition settles, and the adapter remains confined to
one module for later migration.

`rs mcp` starts one `McpServer` over `StdioServerTransport` and registers:

- `project_status`: no arguments; reads the store at call time and returns concise text plus the
  JSON status as structured content.

Tool annotations are `readOnlyHint: true`, `destructiveHint: false`, and `openWorldHint: false`.
The server instructions state that results are checkout-local, read-only observations and may be
partial or stale. Stdout is protocol-only; startup and diagnostic logging use stderr.

The MCP process resolves its workspace once from an explicit start path passed by the CLI. It does
not treat that path as the identity of a producer package. The status projection carries the actual
package and environment identities recorded by each producer.

## Repository scenarios

The design must pass all of these cases:

1. a standalone Rsbuild application;
2. a standalone Rslib package with no Rsbuild application;
3. a monorepo with five independent Rslib watch processes and one Rsbuild dev server;
4. a repository defining both app and library configs;
5. two concurrent runs targeting the same context;
6. an MCP process started at the repository root after producers already started;
7. no captured runs, returning an empty but valid status;
8. capture disabled or forced off, leaving the user's config untouched.

No Turbo, Nx, workspace task graph, package-manager process, port registry, or producer-to-MCP socket
is required.

## Testing strategy

- Unit-test activation precedence and immutable plugin append for object and async config forms.
- Unit-test deterministic context identity, relative path normalization, bounds, sequence behavior,
  missing Stats, and capture-failure isolation.
- Exercise Rsbuild and Rslib injection through their CLI-specific loaders without instrumenting the
  shared pure resolvers.
- Test status projection with empty, multi-package, and concurrent-run stores.
- Test MCP in process using the SDK's linked `InMemoryTransport`, then smoke-test `rs mcp --help` and
  stdio startup without writing protocol noise to stdout.
- Run the full Rstack build, native build, static checks, spelling checks, and workspace tests.

## Out of scope

- deep Rspack ModuleGraph, ChunkGraph, export-use, or source-map capture;
- Rsdoctor artifact discovery, Agent CLI adaptation, or report links;
- diagnostics beyond build error and warning counts;
- source revision and dirty-content digests;
- record retention, pinning, subscriptions, HTTP transport, or a daemon;
- Rslint and Rstest producers;
- plugin bundles and skills, which consume this MCP surface in later slices;
- any MCP tool that starts builds, edits configuration, or writes project files.
