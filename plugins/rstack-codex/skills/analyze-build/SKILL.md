---
name: analyze-build
description: Analyze an explicit Rstack Rsdoctor artifact with the narrowest build-wide view. Use this skill when summarizing build health or errors, inspecting chunks or packages, finding bundle optimizations, or reviewing build-wide tree-shaking evidence; use explain-dead-code for one module.
---

# Analyze build

1. Call `project_status` to establish available contexts and latest build observations. Analysis can
   still proceed from the explicit artifact when no recorded context exists.
2. Obtain the user's explicit Rsdoctor `dataFile`; do not start a build or discover an artifact implicitly. If it is missing, explain that the package needs `@rsdoctor/rspack-plugin` and an explicit `RSTACK_CONTEXT=1 RSDOCTOR=true RSDOCTOR_OUTPUT=json rs build` or `rs lib` run, then ask before any install or build.
3. Call `rsdoctor_analyze` with the narrowest suitable `toolName` and only the input that view needs:
   - Use `build_summary` for timing and compilation-duration totals; `build_summary` is a timing summary, not a complete build-health verdict.
   - Use `errors_list` for build errors.
   - Use `chunks_list` for chunk composition.
   - Use `bundle_optimize` for optimization opportunities.
   - Use `tree_shaking_retained_modules` for retained modules.
   - Use `tree_shaking_side_effects` for side effects.
   - Use `tree_shaking_summary` for a tree-shaking overview.
   - Use `packages_direct_dependencies` for direct bundled dependencies.
   - Use `packages_duplicates` for bundled duplicate packages.
   - Use `packages_similar` for similar bundled packages.
     When the question asks about warnings or build health, query `errors_list` for reported errors
     and warnings and query `bundle_optimize` for detected optimization opportunities. Add the
     relevant tree-shaking or package view when that is part of the requested health assessment.
4. Summarize the returned evidence and its artifact boundary. Distinguish missing or `null` data
   from a measured zero or a healthy result. Use another narrow view only when the first result
   makes it necessary.
5. Call `report_link` only when a navigable local report would help. Treat it as optional.

Never require a GUI. Do not infer source execution or repository-wide dead code from build-artifact evidence.
