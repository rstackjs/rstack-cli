# Context Plugin Boundary Implementation Plan

<!-- cspell:ignore Kiali kiali Midscene midscene dogfood mktemp subdependency subpaths -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@rstackjs/context` a standalone multi-entry package and integrate it into Rstack CLI through the stacked plugin SPI with minimal, one-way coupling, then publish previews and validate the installed agent plugin against real repositories.

**Architecture:** Context exports focused producer/consumer entry points plus a structurally compatible `./rstack` plugin without importing `rstack`. Rstack CLI stacks on PR #336, registers that plugin internally, and retains only first-party config and explicit MCP host adapters. Agent Skills launches the workspace-local `rs mcp` runtime and is validated against preview packages rather than bundling another Context runtime.

**Tech Stack:** TypeScript, pnpm 11, Rslib, Rsbuild, Rstest, Rslint, MCP SDK, pkg.pr.new, GitHub CLI.

## Global Constraints

- `@rstackjs/context` must not import or declare a dependency on `rstack`.
- Rsdoctor produces artifacts; Context consumes them through `@rsdoctor/agent-cli`. There is no Context plugin for Rsdoctor.
- Preserve the existing Context root API and MCP tool schemas.
- Focused entry points must load independently when unrelated producers are absent.
- Missing Rstest or Rslint support degrades to unavailable evidence rather than preventing build or Rsdoctor analysis.
- Published Context packages must use ordinary semver dependencies; pkg.pr.new URLs may appear only in root development overrides.
- Keep corresponding English and Chinese Rstack documentation aligned in structure, meaning, links, examples, and heading anchors.
- Use TDD for every behavior change and commit each independently testable deliverable.
- Preserve existing user changes in every worktree and never reset unrelated files.

---

## File Structure

### Context repository

- `src/rsbuild.ts`: focused exports for the existing Rsbuild observer.
- `src/rslib.ts`: Rslib-facing exports over the same environment observer.
- `src/rstest.ts`: test capture, result, execution-evidence, and related-test contracts.
- `src/rslint.ts`: lint capture, diagnostic, and fix-preview contracts.
- `src/rstack.ts`: structural Rstack plugin factory; no Rstack imports.
- `src/rsdoctor.ts`: existing Rsdoctor consumer adapter and its focused package entry point.
- `src/mcp.ts`: existing MCP server entry point.
- `src/index.ts`: compatibility aggregate exports.
- `rslib.config.ts`: build every public subpath.
- `package.json`: export map and semver-safe Rsdoctor dependency.
- `pnpm-lock.yaml`: root development override resolution.
- `tests/packageExports.test.ts`: independent entry-point and packed-manifest checks.
- `tests/rstack.test.ts`: structural plugin behavior.

### Rstack CLI repository

- `packages/rstack/src/plugin.ts`: modifier invocation-context types from PR #336.
- `packages/rstack/src/pluginRuntime.ts`: pass invocation context to modifiers.
- `packages/rstack/src/config.ts`: register the Context plugin after user plugins.
- `packages/rstack/src/contextPlugin.ts`: construct the Context plugin from loaded config metadata.
- `packages/rstack/src/rsbuildConfig.ts`: resolve config and apply normal plugin modifiers only.
- `packages/rstack/src/rslibConfig.ts`: resolve config and apply normal plugin modifiers only.
- `packages/rstack/src/rstestConfig.ts`: preserve automatic extends while passing native modifier context.
- `packages/rstack/src/mcp.ts`: thin explicit lint/test host adapter using focused Context subpaths.
- `packages/rstack/src/relatedTests.ts`: CLI-owned related-test resolver using the Context contract.
- `packages/rstack/src/context.ts`: compatibility re-export.
- `packages/rstack/tests/pluginRuntime.test.ts`: modifier-context contract.
- `packages/rstack/tests/context/plugin.test.ts`: built-in Context plugin integration and deduplication.
- `packages/rstack/tests/context/mcp.test.ts`: explicit host capture behavior.
- `packages/rstack/tests/types/resolution-bundler/index.ts`: public structural compatibility.
- `packages/rstack/tests/types/resolution-nodenext/index.ts`: public structural compatibility.
- `website/docs/en/guide/plugins.mdx` and `website/docs/zh/guide/plugins.mdx`: internal Context plugin relationship.
- `website/docs/en/guide/cli/mcp.mdx` and `website/docs/zh/guide/cli/mcp.mdx`: runtime ownership and graceful degradation.

### Agent Skills repository

- `scripts/test-rstack-context-plugin.mjs`: validate launcher behavior against a real preview-installed Rstack package when an integration fixture is supplied.
- `README.md`: document that the plugin launches workspace-local Rstack and does not bundle Context.
- Existing Context-related skills: adjust only when real dogfood exposes a workflow defect.

---

### Task 1: Publish-safe Context dependency and focused entry points

**Files:**

- Modify: `/fast/projects/context/package.json`
- Modify: `/fast/projects/context/pnpm-lock.yaml`
- Modify: `/fast/projects/context/rslib.config.ts`
- Modify: `/fast/projects/context/src/index.ts`
- Create: `/fast/projects/context/src/rsbuild.ts`
- Create: `/fast/projects/context/src/rslib.ts`
- Create: `/fast/projects/context/src/rstest.ts`
- Create: `/fast/projects/context/src/rslint.ts`
- Test: `/fast/projects/context/tests/packageExports.test.ts`

**Interfaces:**

- Consumes: existing exports from `build.ts`, `testRun.ts`, `execution.ts`, `lint.ts`, `rsdoctor.ts`, and `mcp.ts`.
- Produces: public package subpaths `./rsbuild`, `./rslib`, `./rstest`, `./rslint`, `./rsdoctor`, and the existing `./mcp`.

- [ ] **Step 1: Write failing export-map and package-isolation tests**

Add a test that reads `package.json` and asserts the complete subpath set, ordinary semver for `dependencies['@rsdoctor/agent-cli']`, and no `rstack` dependency in any dependency section:

```ts
expect(Object.keys(packageJson.exports).sort()).toEqual([
  '.',
  './mcp',
  './package.json',
  './rsbuild',
  './rsdoctor',
  './rslib',
  './rslint',
  './rstest',
]);
expect(packageJson.dependencies['@rsdoctor/agent-cli']).toBe('0.1.1');
for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
  expect(packageJson[section]?.rstack).toBeUndefined();
}
```

Add dynamic import assertions for each focused entry point created by this task after a build.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
pnpm test tests/packageExports.test.ts
```

Expected: FAIL because the focused export map and built files do not exist and the Rsdoctor dependency is an exotic URL.

- [ ] **Step 3: Add focused source barrels and Rslib entries**

Export only producer-relevant symbols. For example:

```ts
// src/rsbuild.ts
export {
  appendBuildContextPlugin,
  createBuildContextPlugin,
  type BuildContextPluginOptions,
} from './build.ts';
```

```ts
// src/rstest.ts
export {
  captureTestSnapshot,
  listTestResults,
  type RelatedTestRequest,
  type ResolveRelatedTests,
  type TestCaptureDependencies,
  type TestCaptureResult,
  type TestResultPage,
  type TestResultsQuery,
  type TestSnapshotRequest,
} from './testRun.ts';
export { type ExecutionFacet, type TestExecutionRequest } from './execution.ts';
```

Add matching Rslib `source.entry` values and package export-map entries. Keep the root barrel exports unchanged.

- [ ] **Step 4: Move the Rsdoctor preview to a root-only override**

Set the published dependency to:

```json
"@rsdoctor/agent-cli": "0.1.1"
```

Add a root pnpm override for the development checkout:

```json
"pnpm": {
  "overrides": {
    "@rsdoctor/agent-cli": "https://pkg.pr.new/@rsdoctor/agent-cli@1903"
  }
}
```

Run `pnpm install --frozen-lockfile=false` and confirm `pnpm why @rsdoctor/agent-cli` resolves the preview locally while the package manifest remains semver-safe.

- [ ] **Step 5: Build and rerun the focused tests**

Run:

```bash
pnpm build
pnpm test tests/packageExports.test.ts tests/rsdoctor.test.ts
pnpm check
```

Expected: all commands pass; every subpath imports from `dist`, and omitted Rsdoctor sections retain the preview contract.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml rslib.config.ts src/index.ts src/rsbuild.ts src/rslib.ts src/rstest.ts src/rslint.ts tests/packageExports.test.ts
git commit -m "feat: expose focused context entry points"
```

### Task 2: Context-owned structural Rstack plugin

**Files:**

- Create: `/fast/projects/context/src/rstack.ts`
- Modify: `/fast/projects/context/rslib.config.ts`
- Modify: `/fast/projects/context/package.json`
- Modify: `/fast/projects/context/src/index.ts`
- Test: `/fast/projects/context/tests/rstack.test.ts`
- Test: `/fast/projects/context/tests/packageExports.test.ts`

**Interfaces:**

- Consumes: `ContextConfig`, `resolveContextCapture`, `resolveContextWorkspace`, `recordContextInputFiles`, `createBuildContextPlugin`, and `appendBuildContextPlugin`.
- Produces: `createRstackContextPlugin(options): ContextRstackPlugin`, where the returned object has `name: 'rstack:context'` and a structural `setup(api)` method.

- [ ] **Step 1: Write failing plugin tests**

Cover capture-off, application, library, input deduplication, native params, existing plugin preservation, and mixed app/lib registration. Use a fake structural API that records modifiers:

```ts
const plugin = createRstackContextPlugin({
  config: { enabled: true },
  configFilePath: '/workspace/rstack.config.ts',
  configDependencies: ['/workspace/shared.ts'],
  cwd: '/workspace',
});

expect(plugin.name).toBe('rstack:context');
plugin.setup(api);
expect([...modifiers.keys()]).toEqual(['app', 'lib']);
```

Assert the app modifier passes `producer: 'rsbuild'`, the lib modifier passes `producer: 'rslib'`, and both receive the exact modifier `params` object.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
pnpm test tests/rstack.test.ts
```

Expected: FAIL because `src/rstack.ts` and its export do not exist.

- [ ] **Step 3: Implement the structural plugin factory**

Define local structural types rather than importing `rstack`:

```ts
type ContextRstackModifierContext = Readonly<{ params: ConfigParams }>;
type ContextRstackPluginApi = {
  modifyConfig(
    kind: 'app' | 'lib',
    handler: (
      config: RsbuildConfig,
      context: ContextRstackModifierContext,
    ) => RsbuildConfig | Promise<RsbuildConfig>,
  ): void;
};

type ContextRstackPlugin = {
  name: 'rstack:context';
  setup(api: ContextRstackPluginApi): void;
};
```

Resolve workspace and input metadata lazily once per plugin instance. Register no modifiers when capture is off. Append one observer per resolved config without mutating existing arrays.

- [ ] **Step 4: Export and build the `./rstack` entry point**

Add `rstack: './src/rstack.ts'` to Rslib entries and map `./rstack` to `dist/rstack.{js,d.ts}` in `package.json`. Re-export the factory and its option/structural types from the compatibility barrel.

Extend `tests/packageExports.test.ts` so the expected export list and independent-import assertion now include `./rstack`.

- [ ] **Step 5: Verify behavior and no reverse dependency**

Run:

```bash
pnpm build
pnpm test tests/rstack.test.ts tests/packageExports.test.ts
pnpm check
rg -n "from ['\"]rstack|import\(['\"]rstack" src package.json
```

Expected: tests and checks pass; the final `rg` returns no matches.

- [ ] **Step 6: Commit**

```bash
git add src/rstack.ts src/index.ts rslib.config.ts package.json tests/rstack.test.ts tests/packageExports.test.ts
git commit -m "feat: add structural Rstack context plugin"
```

### Task 3: Publish and validate the Context preview

**Files:**

- No source changes expected.
- Generated test artifact: a temporary packed tarball outside the repository.

**Interfaces:**

- Consumes: commits from Tasks 1 and 2.
- Produces: a pkg.pr.new Context preview URL whose packed manifest has no exotic transitive dependency.

- [ ] **Step 1: Run complete Context verification**

Run:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm check
pnpm pack --pack-destination "$(mktemp -d)"
```

Expected: 137 or more tests pass, build/check pass, and packing succeeds.

- [ ] **Step 2: Push and wait for Context PR checks**

Run:

```bash
git push origin codex/extract-context
gh pr checks 1 --repo rstackjs/context --watch --interval 10
```

Expected: verify, publish, and Continuous Releases pass while PR #1 remains draft.

- [ ] **Step 3: Install the preview in a clean consumer**

Resolve the current short SHA and use it in a temporary project:

```bash
context_sha=$(git rev-parse --short HEAD)
consumer_dir=$(mktemp -d)
cd "$consumer_dir"
pnpm init
pnpm add "https://pkg.pr.new/rstackjs/context/@rstackjs/context@${context_sha}"
node -e "Promise.all(['rsbuild','rslib','rstest','rslint','rsdoctor','mcp','rstack'].map((name)=>import('@rstackjs/context/'+name)))"
```

Expected: install and every import succeed without an exotic-subdependency error.

### Task 4: Stack Rstack Context on the plugin SPI

**Files:**

- Merge: `origin/pr-336` into `/fast/projects/rstack-cli` branch `codex/rstack-mcp-observability`.
- Modify during conflict resolution: `packages/rstack/src/config.ts`
- Modify during conflict resolution: `packages/rstack/src/cli/commands.ts`
- Modify during conflict resolution: `packages/rstack/src/rsbuildConfig.ts`
- Modify during conflict resolution: `packages/rstack/src/rslibConfig.ts`
- Modify during conflict resolution: `packages/rstack/src/rstestConfig.ts`
- Modify: `packages/rstack/package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: PR #336 plugin SPI and the Context preview from Task 3.
- Produces: a clean stacked branch retaining `define.context`, `rs mcp`, and all plugin SPI behavior.

- [ ] **Step 1: Update the Context preview before stacking**

Replace the inconsistent preview references in `packages/rstack/package.json` and `pnpm-workspace.yaml` with the Task 3 preview URL, then run:

```bash
pnpm install --frozen-lockfile=false
pnpm --filter rstack build
git add packages/rstack/package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "build: update context preview"
```

Expected: installation succeeds because the Context package no longer exposes an exotic subdependency.

- [ ] **Step 2: Merge the plugin SPI head**

Run:

```bash
git fetch https://github.com/rstackjs/rstack-cli.git refs/pull/336/head:refs/remotes/origin/pr-336
git merge --no-ff origin/pr-336 -m "chore: stack context on plugin SPI"
```

Resolve conflicts by retaining PR #336 plugin registration/modifier behavior and PR #344's `context` config plus built-in `mcp` dispatch. Do not retain direct build-observer injection in `rsbuildConfig.ts` or `rslibConfig.ts`; Task 6 replaces it through the plugin.

- [ ] **Step 3: Run the stacked baseline**

Run:

```bash
pnpm --filter rstack build
pnpm --filter rstack test
```

Expected: the stacked baseline compiles and existing tests pass before SPI extension work begins.

### Task 5: Pass native invocation context through the plugin SPI

**Files:**

- Modify: `/fast/projects/rstack-cli/packages/rstack/src/plugin.ts`
- Modify: `/fast/projects/rstack-cli/packages/rstack/src/pluginRuntime.ts`
- Modify: `/fast/projects/rstack-cli/packages/rstack/src/config.ts`
- Modify: `/fast/projects/rstack-cli/packages/rstack/src/rsbuildConfig.ts`
- Modify: `/fast/projects/rstack-cli/packages/rstack/src/rslibConfig.ts`
- Modify: `/fast/projects/rstack-cli/packages/rstack/src/rstestConfig.ts`
- Test: `/fast/projects/rstack-cli/packages/rstack/tests/pluginRuntime.test.ts`
- Test: `/fast/projects/rstack-cli/packages/rstack/tests/config/plugin-modifiers/adapters.test.ts`

**Interfaces:**

- Consumes: PR #336 `RstackConfigMap`, `modifyConfig`, and `applyConfigModifiers`.
- Produces: `RstackConfigModifierContextMap` and `applyConfigModifiers(kind, config, context)` with exact native params.

- [ ] **Step 1: Write failing modifier-context tests**

Add a plugin runtime test:

```ts
const params = { command: 'build', env: 'production', envMode: 'production' };
plugin.setup(({ modifyConfig }) => {
  modifyConfig('app', (_config, context) => {
    observed = context.params;
  });
});
await runtime.applyConfigModifiers('app', {}, { params });
expect(observed).toBe(params);
```

Add adapter tests proving app, lib, and automatic Rstest extends forward their native params.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
pnpm --filter rstack test -- tests/pluginRuntime.test.ts tests/config/plugin-modifiers/adapters.test.ts
```

Expected: type/test failures because modifier handlers currently receive one argument.

- [ ] **Step 3: Add the typed context map**

Define a second-argument context object in `plugin.ts`:

```ts
export type RstackConfigModifierContextMap = {
  app: Readonly<{ params: RsbuildConfigParams }>;
  lib: Readonly<{ params: RslibConfigParams }>;
  test: Readonly<{ params: RsbuildConfigParams }>;
  doc: Readonly<Record<string, never>>;
  lint: Readonly<Record<string, never>>;
  fmt: Readonly<Record<string, never>>;
  staged: Readonly<Record<string, never>>;
};
```

Update modifier handler and runtime signatures to receive the matching context. Existing handlers that ignore the second argument remain compatible.

- [ ] **Step 4: Pass native params from tool loaders**

Call app, lib, and test modifiers with `{ params }`. Pass `{}` for doc, lint, fmt, and staged. When Rstest builds automatic app/lib extends, pass the same native Rstest/Rsbuild params to the selected modifier.

- [ ] **Step 5: Run focused and package checks**

Run:

```bash
pnpm --filter rstack test -- tests/pluginRuntime.test.ts tests/config/plugin-modifiers
pnpm --filter rstack build
pnpm check
```

Expected: tests, build, lint, type checking, and formatting pass.

- [ ] **Step 6: Commit**

```bash
git add packages/rstack/src/plugin.ts packages/rstack/src/pluginRuntime.ts packages/rstack/src/config.ts packages/rstack/src/rsbuildConfig.ts packages/rstack/src/rslibConfig.ts packages/rstack/src/rstestConfig.ts packages/rstack/tests/pluginRuntime.test.ts packages/rstack/tests/config/plugin-modifiers
git commit -m "feat(rstack): pass tool context to plugin modifiers"
```

### Task 6: Consume the Context plugin and remove scattered build coupling

**Files:**

- Create: `/fast/projects/rstack-cli/packages/rstack/src/contextPlugin.ts`
- Modify: `/fast/projects/rstack-cli/packages/rstack/src/config.ts`
- Modify: `/fast/projects/rstack-cli/packages/rstack/src/rsbuildConfig.ts`
- Modify: `/fast/projects/rstack-cli/packages/rstack/src/rslibConfig.ts`
- Modify: `/fast/projects/rstack-cli/packages/rstack/src/mcp.ts`
- Modify: `/fast/projects/rstack-cli/packages/rstack/src/relatedTests.ts`
- Modify: `/fast/projects/rstack-cli/packages/rstack/src/context.ts`
- Test: `/fast/projects/rstack-cli/packages/rstack/tests/context/plugin.test.ts`
- Test: `/fast/projects/rstack-cli/packages/rstack/tests/context/mcp.test.ts`
- Test: `/fast/projects/rstack-cli/packages/rstack/tests/types/resolution-bundler/index.ts`
- Test: `/fast/projects/rstack-cli/packages/rstack/tests/types/resolution-nodenext/index.ts`

**Interfaces:**

- Consumes: `createRstackContextPlugin()` from Context Task 2 and modifier context from Task 5.
- Produces: internal `createContextPlugin(loaded, cwd): RstackPlugin`; CLI build loaders contain no direct Context observer calls.

- [ ] **Step 1: Write failing built-in integration tests**

Cover:

```ts
expect(runtime.hasConfigModifier('app')).toBe(true);
expect(runtime.hasConfigModifier('lib')).toBe(true);
```

Assert user modifiers run before the internal Context modifier, capture-off registers neither modifier, app-only and lib-only configs each append one observer, mixed configs remain independent, and repeated resolution does not append the same observer twice to one config.

Add a type test assigning the Context result directly:

```ts
const contextPlugin: RstackPlugin = createRstackContextPlugin({
  cwd: process.cwd(),
  config: { enabled: true },
  configFilePath: null,
  configDependencies: [],
});
void contextPlugin;
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
pnpm --filter rstack test -- tests/context/plugin.test.ts tests/context/mcp.test.ts
pnpm --filter rstack build
```

Expected: missing `contextPlugin.ts`, missing internal registration, or structural compatibility failures.

- [ ] **Step 3: Implement the CLI-owned plugin adapter**

Create `contextPlugin.ts` that imports only `createRstackContextPlugin` from `@rstackjs/context/rstack` and the public local `RstackPlugin` type. Normalize the loaded config path once and pass `loaded.configs.context`, `loaded.dependencies`, and the loaded directory/cwd into Context.

Register plugins in `getRstackPluginRuntime` as:

```ts
plugins: [config.plugins, createContextPlugin(config, resolvedCwd)];
```

This preserves user order and runs Context last.

- [ ] **Step 4: Remove direct build injection from tool loaders**

Delete direct imports of `appendBuildContextPlugin`, `createBuildContextPlugin`, `recordContextInputFiles`, `resolveContextCapture`, and `resolveContextWorkspace` from `rsbuildConfig.ts` and `rslibConfig.ts`. Both loaders should resolve the native config, call the standard plugin modifier pipeline with `{ params }`, and retain existing config-watch behavior.

- [ ] **Step 5: Use focused Context entry points in host adapters**

Update `mcp.ts` to import the server from `@rstackjs/context/mcp`, lint capture from `@rstackjs/context/rslint`, and test capture from `@rstackjs/context/rstest`. Update `relatedTests.ts` to import its request type from `@rstackjs/context/rstest`. Preserve `withRstackConfigTarget`, wrapper paths, and `define.test()` detection in the CLI.

- [ ] **Step 6: Verify coupling shape**

Run:

```bash
rg -n "@rstackjs/context" packages/rstack/src
```

Expected matches are limited to config types, `contextPlugin.ts`, `mcp.ts`, `relatedTests.ts`, the public compatibility re-export, and config exports. `rsbuildConfig.ts` and `rslibConfig.ts` must not match.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
pnpm --filter rstack build
pnpm --filter rstack test
pnpm check
```

Then commit:

```bash
git add packages/rstack/src packages/rstack/tests
git commit -m "refactor(rstack): integrate context through plugin SPI"
```

### Task 7: Align Rstack documentation and publish the stacked preview

**Files:**

- Modify: `/fast/projects/rstack-cli/website/docs/en/guide/plugins.mdx`
- Modify: `/fast/projects/rstack-cli/website/docs/zh/guide/plugins.mdx`
- Modify: `/fast/projects/rstack-cli/website/docs/en/guide/cli/mcp.mdx`
- Modify: `/fast/projects/rstack-cli/website/docs/zh/guide/cli/mcp.mdx`
- Modify only if generated by normal build: `/fast/projects/rstack-cli/packages/rstack/docs/guide/plugins.md`
- Modify only if generated by normal build: `/fast/projects/rstack-cli/packages/rstack/docs/guide/cli/mcp.md`

**Interfaces:**

- Consumes: final runtime behavior from Task 6.
- Produces: aligned end-user explanation and a preview package for Agent Skills validation.

- [ ] **Step 1: Update aligned documentation**

State that Context is a built-in internal plugin, users configure it with `define.context()`, standalone consumers can import focused `@rstackjs/context/*` entry points, and `rs mcp` remains a built-in host command. State explicitly that Context consumes Rsdoctor artifacts and does not install a plugin into Rsdoctor.

- [ ] **Step 2: Verify docs and repository**

Run in the required order:

```bash
pnpm build
pnpm --filter rstack build:native
pnpm test
pnpm check
pnpm check:spell
pnpm --dir website build
```

Expected: all commands pass.

- [ ] **Step 3: Commit and push**

```bash
git add website/docs/en/guide/plugins.mdx website/docs/zh/guide/plugins.mdx website/docs/en/guide/cli/mcp.mdx website/docs/zh/guide/cli/mcp.mdx packages/rstack/docs
git commit -m "docs: explain context plugin integration"
git push fork codex/rstack-mcp-observability
```

- [ ] **Step 4: Wait for the Rstack preview**

Run:

```bash
gh pr checks 344 --repo rstackjs/rstack-cli --watch --interval 10
```

Expected: all checks pass and PR #344 remains draft. Read the Continuous Releases output or PR comment to obtain the exact Rstack preview URL.

### Task 8: Validate the Agent Skills bundle against previews

**Files:**

- Modify: `/fast/projects/agent-skills/scripts/test-rstack-context-plugin.mjs`
- Modify: `/fast/projects/agent-skills/README.md`
- Modify only when dogfood proves a workflow defect: `/fast/projects/agent-skills/skills/{analyze-build,assess-change-impact,debug-dev-cycle,explain-dead-code,find-unused-code,review-context-change}/SKILL.md`

**Interfaces:**

- Consumes: Rstack preview from Task 7, which transitively consumes the Context preview from Task 3.
- Produces: a verified repo-based plugin bundle that uses the workspace-local preview runtime.

- [ ] **Step 1: Write a failing real-runtime launcher test**

Extend the plugin test script to accept `RSTACK_PLUGIN_INTEGRATION_ROOT`. When present, read `.mcp.json`, launch the configured server from that root, perform MCP initialize and `tools/list`, and assert `project_status`, `product_roots`, `test_snapshot`, and `code_evidence` are advertised. Keep the existing synthetic launcher tests unchanged.

- [ ] **Step 2: Confirm RED with a root lacking Rstack**

Run:

```bash
RSTACK_PLUGIN_INTEGRATION_ROOT="$(mktemp -d)" pnpm test:plugin
```

Expected: the new integration assertion fails because no workspace-local `rstack` exists.

- [ ] **Step 3: Install the Rstack preview in a clean fixture and pass GREEN**

Create a temporary package, install the exact Rstack preview URL from Task 7, and run:

```bash
RSTACK_PLUGIN_INTEGRATION_ROOT="$fixture_root" pnpm test:plugin
pnpm lint
```

Expected: MCP initialization and tool listing succeed through the plugin launcher.

- [ ] **Step 4: Clarify runtime ownership in README**

Document this exact chain:

```text
Agent plugin -> workspace-local rs mcp -> @rstackjs/context
```

State that Agent Skills does not bundle a second Context runtime and that preview validation installs Rstack into the fixture project.

- [ ] **Step 5: Commit and push**

```bash
git add scripts/test-rstack-context-plugin.mjs README.md skills
git commit -m "test(plugin): validate workspace context runtime"
git push fork codex/rstack-context-plugin
```

### Task 9: Real-world dogfood and PR completion audit

**Files:**

- Modify only minimal fixture config/package files under `/fast/playgrounds` when required to run existing project commands.
- Do not commit fixture changes to the three product PRs.

**Interfaces:**

- Consumes: installed Agent Skills bundle and preview packages from Tasks 3 and 7.
- Produces: evidence-backed usability findings and any narrowly scoped fixes committed to the owning repository.

- [ ] **Step 1: Reinstall the personal plugin from Agent Skills PR head**

Update the existing personal marketplace source without creating another marketplace, reinstall `rstack@personal`, and verify the cache commit equals the Agent Skills PR head.

- [ ] **Step 2: Validate HeaderEditor graceful degradation**

In `/fast/playgrounds/rstack-header-editor`, install the Rstack preview, run its real Rsbuild workflow, start MCP through the installed plugin, and call:

```text
project_status -> product_roots -> unused_modules -> code_evidence
```

Expected: build evidence works; Rstest evidence is unavailable rather than an error that blocks other axes; artifact/build identities match.

- [ ] **Step 3: Validate Kiali mixed evidence**

In `/fast/playgrounds/rstack-kiali/frontend`, install the same Rstack preview, run the real build and selected Rstest suite, capture optional aggregate Istanbul execution evidence, then call:

```text
project_status -> test_results -> diagnostics_list -> product_roots -> code_evidence
```

Expected: build, test, and optional execution evidence remain distinct and share the selected package/context identity.

- [ ] **Step 4: Validate a monorepo with both application and library producers**

Use `/fast/playgrounds/midscene` if already present; otherwise clone `web-infra-dev/midscene` into that path. Install the preview only in the dogfood checkout, make the minimum Rstack config additions needed to expose existing Rsbuild/Rslib/Rstest configuration, run one application build and one library build, and verify `project_status` lists independent contexts without relying on MCP cwd.

- [ ] **Step 5: Fix only reproduced product defects**

For each defect, add a failing test in the owning repository, implement the minimal fix, run focused and full checks, commit, push, wait for the new preview, reinstall it, and repeat the exact dogfood call. Do not add speculative infrastructure or fixture-only behavior.

- [ ] **Step 6: Audit the three owned PRs**

Run:

```bash
gh pr view 1 --repo rstackjs/context --json isDraft,headRefOid,mergeable,statusCheckRollup
gh pr view 344 --repo rstackjs/rstack-cli --json isDraft,headRefOid,mergeable,statusCheckRollup
gh pr view 102 --repo rstackjs/agent-skills --json isDraft,headRefOid,mergeable,statusCheckRollup
```

Expected: all three remain draft, are mergeable, and have green required checks.

---

## Self-Review

- Spec coverage: Tasks 1-3 cover standalone entry points, no reverse dependency, Rsdoctor consumption, and preview policy. Tasks 4-7 cover SPI stacking, native params, internal registration, minimal CLI coupling, docs, and Rstack preview. Tasks 8-9 cover Agent Skills runtime ownership, canary installation, graceful degradation, monorepo behavior, and real dogfood.
- Placeholder scan: the plan contains no unresolved implementation placeholders; runtime SHA/preview values are derived from the committed heads or CI rather than hard-coded before publication.
- Type consistency: `createRstackContextPlugin`, `ContextRstackPlugin`, `RstackConfigModifierContextMap`, `createContextPlugin`, and modifier `{ params }` names are consistent across producing and consuming tasks.
