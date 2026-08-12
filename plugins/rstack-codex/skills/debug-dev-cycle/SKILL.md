---
name: debug-dev-cycle
description: Diagnose current Rstack lint or test failures from stored context evidence, and request an explicit one-shot capture only when the user wants fresh results. Use for development-cycle debugging, failing Rslint diagnostics, or Rstest failures without starting watch mode.
---

# Debug an Rstack development cycle

1. Call `project_status` first. Treat freshness separately for each producer; a fresh build does
   not make lint or test evidence fresh.
2. Prefer existing evidence. Use `snapshot_list` to select a completed `rslint` or `rstest`
   snapshot, then query `diagnostics_list` or `test_results`.
3. State whether the selected evidence is `fresh`, `stale`, `partial`, or `unknown`, including
   changed paths when reported.
4. Ask before running `lint_snapshot` or `test_snapshot`. These are explicit executions, not
   passive queries. Never start watch mode.
5. Surface the first actionable failure with its project, path, test name or rule, and recorded
   message. Then summarize remaining failures briefly.
6. When the user asks to select related tests, recommend
   `rs test list --related <files> --json`; related selection is not an MCP tool.

Use `lint_fix_preview` only when the lint snapshot recorded a preview. Do not apply it. Recommend
an explicit `rs lint --fix <path>` only when the user wants to make that change.
