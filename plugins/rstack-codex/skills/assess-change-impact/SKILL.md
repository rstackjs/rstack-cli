---
name: assess-change-impact
description: Trace observed dependents of one Rstack module to estimate affected product roots and chunks. Use for change-impact, blast-radius, or consumer questions grounded in an explicit Rsdoctor artifact.
---

# Assess change impact

Require the project's `rs` executable to be available on the MCP host's `PATH`.

1. Obtain the exact `contextId`, explicit Rsdoctor `dataFile`, and module ID, exact path/name, or unique path suffix.
2. Call `module_impact` with `direction: "dependents"`. Set `maxDepth` from 1 to 16 only when useful.
3. Report the subject, visited dependent modules, and `totalVisited` versus `returned`.
4. Group the reached product roots by kind and list distinct affected chunk IDs.
5. State whether traversal was truncated and preserve every returned bound and provenance field.

Describe impact only within the explicit artifact graph. Call out that source-only, test-only, runtime-created, and external package consumers may be unobserved. Do not claim the result is a complete repository-wide blast radius.
