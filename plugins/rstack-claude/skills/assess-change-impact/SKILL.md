---
name: assess-change-impact
description: Trace observed dependents of one Rstack module to estimate affected product roots and chunks. Use this skill when estimating artifact-scoped module blast radius or bundled consumers; do not use it for source-symbol or test impact.
---

# Assess change impact

1. Call `project_status`. Select the context whose package root, product, environment, and target
   match the user's build. Deduplicate repeated runs by `contextId`, and ask the user to choose only
   if several distinct contexts match.
2. Classify the requested subject. An artifact module selector is a module ID, exact module path or
   name, or unique path suffix from the Rsdoctor artifact. For a local symbol such as a function,
   class, or export, route the question to source-level lint, TypeScript, or static analysis.
3. Obtain the explicit Rsdoctor `dataFile`. When the matching build context or artifact is missing,
   identify the configured product and give its exact minimal capture command:
   `RSTACK_CONTEXT=1 RSDOCTOR=true RSDOCTOR_OUTPUT=json rs build` for an application or
   `RSTACK_CONTEXT=1 RSDOCTOR=true RSDOCTOR_OUTPUT=json rs lib` for a library. Explain that the
   package needs `@rsdoctor/rspack-plugin`. Ask before running a capture or installation.
4. Call `module_impact` with the selected `contextId`, artifact module selector, and
   `direction: "dependents"`. Set `maxDepth` from 1 to 16 only when useful.
5. Report the subject, visited dependent modules, and `totalVisited` versus `returned`.
6. Group the reached product roots by kind and list distinct affected chunk IDs.
7. State whether traversal was truncated and preserve every returned bound and provenance field.

Describe impact only within the explicit artifact graph. Call out that source-only, test-only, runtime-created, and external package consumers may be unobserved. Do not claim the result is a complete repository-wide blast radius.
