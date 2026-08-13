---
name: analyze-build
description: Analyze an explicit Rstack Rsdoctor artifact with the narrowest build-wide view. Use this skill when summarizing build health or errors, inspecting chunks or packages, finding bundle optimizations, or reviewing build-wide tree-shaking evidence; use explain-dead-code for one module.
---

# Analyze build

1. Call `project_status` to establish available contexts and latest build observations. Analysis can
   still proceed from the explicit artifact when no recorded context exists.
2. Obtain the user's explicit Rsdoctor `dataFile`. When the build context or artifact is missing,
   identify the configured product and give its exact minimal capture command:
   `RSTACK_CONTEXT=1 RSDOCTOR=true RSDOCTOR_OUTPUT=json rs build` for an application or
   `RSTACK_CONTEXT=1 RSDOCTOR=true RSDOCTOR_OUTPUT=json rs lib` for a library. Explain that the
   package needs `@rsdoctor/rspack-plugin`. Ask before running a capture or installation.
3. When a matching build context exists, call `product_roots` with the same `contextId` and
   `dataFile` to check its exact `artifactBinding`. Use context-bound claims for `exact`; keep
   `mismatch` or `explicit-unverified` analysis artifact-only and report that boundary.
4. Call `rsdoctor_analyze` with the narrowest suitable `toolName` and only the input that view needs:
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
5. Summarize the returned evidence and its artifact boundary. Treat omitted Rsdoctor sections as
   unavailable; reserve measured-zero or healthy labels for returned evidence. Use another narrow
   view only when the first result makes it necessary.
6. Call `report_link` only when a navigable local report would help. Treat it as optional.

Never require a GUI. Do not infer source execution or repository-wide dead code from build-artifact evidence.
