# Context repository extraction implementation plan

> Execute this plan inline without additional approval checkpoints. Keep all coordinated pull requests
> in draft until the standalone package has a stable release.

**Goal:** Move `@rstackjs/context` and its engine-owned documentation/tests into a standalone public
`rstackjs/context` repository while preserving history and keeping Rstack CLI as the thin MCP host.

**Architecture:** `rstackjs/context` owns the evidence runtime and MCP implementation. `rstack-cli`
owns command/config adapters and the compatibility export. `agent-skills` owns only plugin packaging,
workflows, and evaluations.

**Stack:** pnpm, TypeScript, Rslib, Rsbuild, Rstest, Rslint, MCP SDK, Rsdoctor Agent CLI, pkg.pr.new.

---

## Task 1: create the repository and preserve history

1. Create public `rstackjs/context` with a minimal default branch and clone it to
   `/fast/projects/context`.
2. Create `codex/extract-context` from `main`.
3. In a temporary clone of Rstack CLI, filter the current context branch to `packages/context` and
   the context-engine RFC, renaming those paths to the standalone repository root and `docs/rfc.md`.
4. Merge the filtered history into the extraction branch with unrelated histories allowed.
5. Verify the resulting graph retains focused package commits without unrelated CLI paths.

## Task 2: add standalone Rstack tooling and package metadata

1. Add the pnpm workspace catalog, TypeScript configuration, Rslint configuration, formatting
   configuration, Git ignore rules, license, and repository guidance.
2. Update package repository/bugs/homepage metadata to `rstackjs/context` while preserving the
   package name, version, exports, Node requirement, and store/MCP contracts.
3. Keep Rslib as the package builder, Rstest as the test runner, Rslint as the linter, and Rsbuild as
   the observer integration API. Do not add a circular development dependency on `rstack`.
4. Add CI and one pkg.pr.new workflow invocation using the repository's locked dependency.
5. Add package packing and clean-consumer smoke coverage.

## Task 3: relocate engine-owned tests and documentation

1. Move generic MCP/config tests still located under `packages/rstack/tests/context` into the
   standalone package where their behavior is runtime-owned.
2. Keep only command, wrapper-config, related-test, and injection integration tests in Rstack CLI.
3. Keep the full architecture RFC in `rstackjs/context`; reduce Rstack CLI documentation to the
   command/config integration and link to the new repository for runtime architecture.
4. Preserve existing API and MCP schemas during the move.

## Task 4: validate and publish a preview

1. Install with the declared pnpm version.
2. Run formatting, Rslint/type checks, Rslib build, Rstest, and package-consumer smoke tests.
3. Commit the standalone repository changes.
4. Push `codex/extract-context` and open a draft pull request.
5. Wait for pkg.pr.new, install the produced preview in a clean consumer, and record the exact
   preview reference for Rstack CLI.

## Task 5: convert Rstack CLI to an external context dependency

1. Remove `packages/context` from the Rstack CLI worktree after the standalone branch is pushed.
2. Replace `workspace:*` with the exact pkg.pr.new preview dependency and update the lockfile.
3. Keep `src/context.ts`, `src/mcp.ts`, config injection, wrapper paths, related-test resolution, and
   `rs mcp` command behavior.
4. Remove or relocate engine-only tests/docs and keep focused host integration coverage.
5. Run `pnpm check`, package builds, native build prerequisite, and the required test suites.
6. Commit and push the existing `codex/rstack-mcp-observability` draft branch.

## Task 6: align Agent Skills and evaluate the installation

1. Update runtime repository references in `/fast/projects/agent-skills` without moving engine code
   into the plugin.
2. Validate Codex/Claude manifest and skill parity plus launcher tests.
3. Refresh the personal installed plugin from the existing personal marketplace.
4. Verify the MCP exposes the complete tool catalog and `project_status` works.
5. Run real-repository evaluations for build-only, library-only, and test-enabled projects, checking
   that missing producers degrade to unavailable evidence rather than errors.
6. Commit and push the existing Agent Skills draft branch if it changed.

## Task 7: final coordinated review

1. Review all changed repositories for accidental scope expansion and compatibility regressions.
2. Verify the new context PR, Rstack CLI PR, Agent Skills PR, and Rsdoctor PR remain drafts where
   applicable and have no unresolved authored review feedback.
3. Check current-head CI, address failures caused by this extraction, and leave unrelated failures
   documented rather than changing unrelated code.
4. Report repository paths, branches, commits, draft PR URLs, preview package reference, verification
   evidence, and the stable-release dependency remaining before merge readiness.
