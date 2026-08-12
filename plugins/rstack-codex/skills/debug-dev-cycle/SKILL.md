---
name: debug-dev-cycle
description: Diagnose current Rstack lint or test failures from stored evidence, with an optional user-approved one-shot capture. Use this skill when debugging one current Rslint or Rstest result; use review-context-change to compare two snapshots.
---

# Debug an Rstack development cycle

1. Call `project_status` first. Treat freshness separately for each producer; a fresh build does
   not make lint or test evidence fresh.
2. Match the requested package and producer to `project_status.context.packageRoot` and keep its
   `contextId`. Deduplicate repeated runs by `contextId`; ask the user to choose only when multiple
   distinct lint or test contexts match. If none exists, report that there is no stored evidence
   and continue to the capture choice in step 5.
3. Prefer existing evidence. When a context exists, use `snapshot_list` with that `contextId` to
   select a completed `rslint` or `rstest` snapshot, then query `diagnostics_list` or `test_results`.
4. State whether the selected evidence is `fresh`, `stale`, `partial`, or `unknown`, including
   changed paths when reported.
5. Ask before running `lint_snapshot` or `test_snapshot`. These are explicit executions, not
   passive queries. For a monorepo package, pass its checkout-relative `packageRoot`; pass
   `configPath` only to select a nonstandard checkout-relative Rstack config. Without
   `packageRoot`, capture defaults to the checkout root, and without `configPath`, it uses the
   ordinary `rstack.config.ts|js|mts|mjs` in the selected package. Never start watch mode.
6. Surface the first actionable failure with its project, path, test name or rule, and recorded
   message. Then summarize remaining failures briefly.
7. When the user asks to select related tests, recommend
   `rs test list --related <files> --json`; related selection is not an MCP tool.

Use `lint_fix_preview` only when the lint snapshot recorded a preview. Do not apply it. Recommend
an explicit `rs lint --fix <path>` only when the user wants to make that change.
