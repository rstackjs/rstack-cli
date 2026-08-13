# Rstack Context Package And Agent Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Rstack Context as a separated runtime package in `rstack-cli` and distribute its Codex/Claude workflows through the existing `rstack` plugin in `rstackjs/agent-skills`.

**Architecture:** `@rstackjs/context` owns the evidence model, local store, producer capture, Rsdoctor graph analysis, composed queries, and MCP server. The `rstack` package owns CLI/config integration and starts that server through `rs mcp`. The repository-based `rstack` plugin in `agent-skills` owns the MCP bootstrap, agent workflows, installation documentation, and evaluations; it never duplicates runtime analysis.

**Tech Stack:** TypeScript, Rslib, Rstest, Rslint, MCP SDK, Zod, Codex plugins, Claude Code plugins, Agent Skills.

## Global Constraints

- Keep work on `codex/rstack-mcp-observability` in `rstack-cli` and `codex/rstack-context-plugin` in `agent-skills`.
- Do not create another marketplace or another plugin identity; extend the existing `rstack` plugin.
- Do not add pkg.pr.new or publish the plugin through npm; plugin distribution stays Git-repository based.
- Keep `rs mcp` and ordinary Rstack configuration as the only runtime bootstrap.
- Preserve the existing MCP tool names and evidence semantics.
- Keep source execution, coverage, reachability, shipment, and public-contract evidence as independent axes.
- Avoid unrelated changes in either repository.

---

### Task 1: Extend the official Rstack plugin

**Files:**

- Create: `/fast/projects/agent-skills/.mcp.json`
- Modify: `/fast/projects/agent-skills/.codex-plugin/plugin.json`
- Modify: `/fast/projects/agent-skills/.claude-plugin/plugin.json`
- Modify: `/fast/projects/agent-skills/.claude-plugin/marketplace.json`
- Create: `/fast/projects/agent-skills/skills/{analyze-build,assess-change-impact,debug-dev-cycle,explain-dead-code,find-unused-code,review-context-change}/SKILL.md`
- Modify: `/fast/projects/agent-skills/skills/rsdoctor-analysis/SKILL.md`
- Modify: `/fast/projects/agent-skills/README.md`
- Test: `/fast/projects/agent-skills/scripts/test-rstack-context-plugin.mjs`
- Test: `/fast/projects/agent-skills/skills-test/rstack-context/evals/evals.json`
- Test: `/fast/projects/agent-skills/skills-test/rstack-context/report.md`

**Interfaces:**

- Consumes: workspace-local `rstack/package.json` and the `rs mcp` command.
- Produces: one MCP server named `rstack` and six context-aware user workflows inside the existing plugin.

- [ ] **Step 1: Write a failing plugin contract test**

The test parses both manifests and `.mcp.json`, asserts the `rstack` server exists, executes the configured launcher against a fake workspace-local `rstack` package and a PATH-only `rs`, and validates the six skills plus their Rsdoctor fallback routing.

- [ ] **Step 2: Run the contract test and record the expected missing-MCP/missing-skill failure**

Run: `node scripts/test-rstack-context-plugin.mjs`

Expected: FAIL because `.mcp.json` and the six skills do not exist.

- [ ] **Step 3: Add the MCP config, update both manifests, and add the six skills**

Use a single inline Node launcher so the host project remains `process.cwd()`. Resolve `rstack/package.json` first and import its declared `rs` binary with `mcp`; otherwise spawn `rs mcp` from `PATH` with inherited stdio and exit status.

- [ ] **Step 4: Add context eval definitions and align Rsdoctor routing**

Cover stored-failure diagnosis, monorepo context selection, artifact-scoped unused candidates, exact dead-code explanation, snapshot comparison, and missing-artifact recovery. Keep `rsdoctor-analysis` usable without Rstack Context and prefer MCP evidence when the server is available.

- [ ] **Step 5: Validate the plugin and skills**

Run:

```bash
node scripts/test-rstack-context-plugin.mjs
python3 /home/zack/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
for skill in skills/analyze-build skills/assess-change-impact skills/debug-dev-cycle skills/explain-dead-code skills/find-unused-code skills/review-context-change; do
  python3 /home/zack/.codex/skills/.system/skill-creator/scripts/quick_validate.py "$skill"
done
pnpm lint
```

- [ ] **Step 6: Commit the agent-skills plugin change**

```bash
git add .mcp.json .codex-plugin .claude-plugin skills README.md scripts/test-rstack-context-plugin.mjs skills-test/rstack-context
git commit -m "feat(plugin): add Rstack Context workflows"
```

### Task 2: Create the separated context package

**Files:**

- Create: `packages/context/package.json`
- Create: `packages/context/rslib.config.ts`
- Create: `packages/context/tsconfig.json`
- Move: `packages/rstack/src/context/*.ts` to `packages/context/src/*.ts`
- Move: context-unit tests from `packages/rstack/tests/context` to `packages/context/tests`
- Modify: `packages/rstack/package.json`
- Modify: `packages/rstack/src/{config.ts,configExports.ts,mcp.ts,rsbuildConfig.ts,rslibConfig.ts}`
- Modify: `packages/rstack/tests/context/{config.test.ts,injection.test.ts,mcp.test.ts}`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: package `@rstackjs/context` with its root API and `createContextMcpServer`.
- Consumes: injected `withConfigTarget`, `rslintConfigPath`, and `rstestConfigPath` from the Rstack CLI adapter for explicit lint/test capture.

- [ ] **Step 1: Add failing package-boundary tests**

Assert `@rstackjs/context` can be imported without importing the Rstack CLI package, and assert the Rstack MCP adapter supplies its wrapper configuration and config-target callback.

- [ ] **Step 2: Run focused tests and record the expected missing-package failure**

Run: `pnpm --filter @rstackjs/context test`

Expected: FAIL because the workspace package does not exist.

- [ ] **Step 3: Move the context engine and remove Rstack-private imports**

Move the evidence engine intact. Add capture dependencies to lint/test/MCP entry points instead of importing `packages/rstack/src/config.ts`; keep local context-store cache helpers inside the package.

- [ ] **Step 4: Wire Rstack CLI to the package**

Import context config/build APIs from `@rstackjs/context`. In `src/mcp.ts`, pass `withRstackConfigTarget` and absolute built wrapper paths before connecting the stdio transport.

- [ ] **Step 5: Move unit tests and retain CLI integration tests**

Use `@rstest/core` for package tests. Keep config injection and built `rs mcp` tests in `packages/rstack/tests/context`.

- [ ] **Step 6: Build and test both packages**

Run:

```bash
pnpm install
pnpm --filter @rstackjs/context build
pnpm --filter @rstackjs/context test
pnpm --filter rstack build
pnpm --filter rstack test
pnpm check
```

- [ ] **Step 7: Commit the package extraction**

```bash
git add packages/context packages/rstack pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "refactor(context): extract context runtime package"
```

### Task 3: Remove duplicate plugin distribution from Rstack CLI

**Files:**

- Delete: `plugins/rstack-codex/**`
- Delete: `plugins/rstack-claude/**`
- Delete: `.agents/plugins/marketplace.json`
- Delete: `packages/rstack/tests/context/plugin-bundles.test.ts`
- Delete: `packages/rstack/tests/context/plugin-skill-recovery.test.ts`
- Modify: `docs/rfcs/0001-rstack-context-engine.md`
- Modify: `website/docs/en/guide/ai.mdx`
- Modify: `website/docs/zh/guide/ai.mdx`

**Interfaces:**

- Consumes: the committed `rstackjs/agent-skills` plugin structure from Task 1.
- Produces: one authoritative runtime repository and one authoritative agent-distribution repository.

- [ ] **Step 1: Update the RFC architecture and ownership map**

Document `@rstackjs/context` as the runtime package, `rstack` as the CLI adapter, and `rstackjs/agent-skills` as the plugin distribution.

- [ ] **Step 2: Remove the two local plugin copies and their copy-parity tests**

Delete only plugin-distribution files; retain every MCP runtime and integration test.

- [ ] **Step 3: Align English and Chinese installation documentation**

Use the existing repository-based installation commands for the `rstack` plugin and explain that the project-local `rstack` dependency supplies `rs mcp`.

- [ ] **Step 4: Run full Rstack verification**

Run:

```bash
pnpm build
pnpm --filter rstack build:native
pnpm test
pnpm check
pnpm check:spell
```

- [ ] **Step 5: Commit distribution cleanup**

```bash
git add -A plugins .agents/plugins packages/rstack/tests/context docs website
git commit -m "docs(context): use the official Rstack agent plugin"
```

### Task 4: Install and dogfood the coordinated result

**Files:**

- No tracked files unless validation finds an in-scope defect.

**Interfaces:**

- Consumes: packed or workspace-built Rstack CLI and the local `agent-skills` marketplace.
- Produces: an evidenced plugin installation and real MCP handshake.

- [ ] **Step 1: Validate the built plugin launcher against the built Rstack CLI**

Run the launcher from a scratch consumer with a workspace-local `rstack` package and send MCP initialize/list-tools JSON-RPC over stdio.

- [ ] **Step 2: Install the local repository marketplace and plugin**

Use the existing `rstack` marketplace identity; do not create another marketplace file.

- [ ] **Step 3: Confirm the MCP reports all context tools**

Call initialize and tools/list, then query `project_status` against a dogfood checkout.

- [ ] **Step 4: Review both branch diffs and commit any in-scope corrections**

Confirm `rstack-cli` contains no installable plugin copy and `agent-skills` contains no evidence-engine implementation.
