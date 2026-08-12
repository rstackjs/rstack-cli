---
name: review-context-change
description: Review changes between two compatible Rstack lint or test snapshots, including freshness and stored lint fix previews. Use when comparing diagnostics or test outcomes before and after a code change without applying fixes.
---

# Review an Rstack context change

1. Use `snapshot_list` to select two completed snapshots for the same producer and context.
   Package roots and selected Rstack configs are part of context identity, so do not compare
   snapshots from different package/config selections.
2. Call `snapshot_diff` with `diagnostics` for Rslint or `tests` for Rstest. If it reports
   incompatibility, explain the listed reasons and stop the comparison.
3. Report the independent freshness of both snapshots before interpreting the delta. Never imply
   that partial or unknown evidence covers unobserved source files.
4. Summarize added, removed, and changed items. Lead with new failures or errors, then resolved
   items, then lower-severity or timing-only changes.
5. For a changed lint file, request `lint_fix_preview` only when a preview was captured. Treat the
   returned text as review material and never apply it.
6. Recommend explicit verification appropriate to the change, such as `rs lint <path>`,
   `rs test <file>`, or `rs test list --related <files> --json`.

Do not run a capture unless the user asks for fresh execution. When they do, reuse the
checkout-relative `packageRoot` and optional `configPath` for the context under review. Never
start watch mode.
