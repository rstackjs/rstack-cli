---
name: analyze-build
description: Analyze an explicit Rstack Rsdoctor build artifact with the narrowest relevant view. Use for build summaries, errors, chunks, bundle optimization, or tree-shaking retention and side-effect questions.
---

# Analyze build

Require the project's `rs` executable to be available on the MCP host's `PATH`.

1. Call `project_status` to establish available contexts and latest build observations.
2. Obtain the user's explicit Rsdoctor `dataFile`; do not start a build or discover an artifact implicitly.
3. Call `rsdoctor_analyze` with the narrowest suitable `toolName` and only the input that view needs:
   - Use `build_summary` for an overview.
   - Use `errors_list` for build errors.
   - Use `chunks_list` for chunk composition.
   - Use `bundle_optimize` for optimization opportunities.
   - Use `tree_shaking_retained_modules` for retained modules.
   - Use `tree_shaking_side_effects` for side effects.
   - Use `tree_shaking_summary` for a tree-shaking overview.
4. Summarize the returned evidence and its artifact boundary. Use another narrow view only when the first result makes it necessary.
5. Call `report_link` only when a navigable local report would help. Treat it as optional.

Never require a GUI. Do not infer source execution or repository-wide dead code from build-artifact evidence.
