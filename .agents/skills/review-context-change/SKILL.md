---
name: review-context-change
description: Review changes between two compatible Rstack lint or test snapshots, including freshness and stored lint fix previews. Use this skill when comparing before-and-after diagnostics or tests; use debug-dev-cycle for one current result.
---

# Review an Rstack context change

1. Call `project_status` first. Match the requested package to `project_status.context.packageRoot`,
   deduplicating repeated runs by `contextId` and asking the user to choose only when multiple distinct contexts match. Use
   `snapshot_list` with that `contextId` and require two compatible completed snapshots for the same
   producer, context, package root, selected Rstack config, and capture selection. The list is
   newest-first: pass the older snapshot as `leftSnapshotId` and the newer snapshot as
   `rightSnapshotId`.
2. When no compatible pair exists, state which explicit capture supplies each missing snapshot:
   `lint_snapshot` for an Rslint comparison or `test_snapshot` for an Rstest comparison. Include the
   checkout-relative `packageRoot` and any nonstandard `configPath`. Ask before running each capture.
3. Call `snapshot_diff` with `diagnostics` for Rslint or `tests` for Rstest. If it reports
   incompatibility, explain the listed reasons and stop the comparison.
4. Report the independent freshness of both snapshots before interpreting the delta. Never imply
   that partial or unknown evidence covers unobserved source files.
5. Summarize added, removed, and changed items. Lead with new failures or errors, then resolved
   items, then lower-severity or timing-only changes.
6. When aggregate execution or exact-path diagnostics would clarify one changed file, call
   `code_evidence` with its exact checkout-relative path and the relevant explicit snapshot ID.
   Keep that point-in-time evidence separate from the snapshot delta.
   Check `diagnostics.truncated`; when true, report the returned and total counts instead of treating
   the diagnostic items as exhaustive.
7. For a changed lint file, call `lint_fix_preview` only when the preview would materially help the
   review. If the snapshot did not capture one, report that it is unavailable. Treat returned text
   as review material and never apply it.
8. Recommend explicit verification appropriate to the change, such as `rs lint <path>`,
   `rs test <file>`, or `rs test list --related <files> --json`.

Do not run a capture unless the user asks for fresh execution. When they do, reuse the
checkout-relative `packageRoot` and optional `configPath` for the context under review. Never
start watch mode.
