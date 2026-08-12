---
name: assess-change-impact
description: Trace observed dependents of one Rstack module to estimate affected product roots and chunks. Use this skill when estimating artifact-scoped module blast radius or bundled consumers; do not use it for source-symbol or test impact.
---

# Assess change impact

1. Call `project_status`. Select the context whose package root, product, environment, and target
   match the user's build. If none exists, explain that a relevant Rstack build must publish a
   context and stop; deduplicate repeated runs by `contextId`, and ask the user to choose only if
   several distinct contexts match.
2. Obtain the explicit Rsdoctor `dataFile` and module ID, exact path/name, or unique path suffix. If the artifact is missing, explain that the package needs `@rsdoctor/rspack-plugin` and an explicit `RSTACK_CONTEXT=1 RSDOCTOR=true RSDOCTOR_OUTPUT=json rs build` or `rs lib` run, then ask before any install or build.
3. Call `module_impact` with the selected `contextId` and `direction: "dependents"`. Set `maxDepth`
   from 1 to 16 only when useful.
4. Report the subject, visited dependent modules, and `totalVisited` versus `returned`.
5. Group the reached product roots by kind and list distinct affected chunk IDs.
6. State whether traversal was truncated and preserve every returned bound and provenance field.

Describe impact only within the explicit artifact graph. Call out that source-only, test-only, runtime-created, and external package consumers may be unobserved. Do not claim the result is a complete repository-wide blast radius.
