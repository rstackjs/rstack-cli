---
name: explain-dead-code
description: Explain whether one Rstack artifact module is reachable, conservatively preserved, an unreachable candidate, or unsupported. Use this skill when answering why one module is included, retained, or apparently unused; it does not analyze local symbols.
---

# Explain dead code

1. Call `project_status`. Select the context whose package root, product, environment, and target
   match the user's build. If none exists, explain that a relevant Rstack build must publish a
   context and stop; deduplicate repeated runs by `contextId`, and ask the user to choose only if
   several distinct contexts match.
2. Obtain the explicit Rsdoctor `dataFile` and module ID, exact path/name, or unique path suffix. If the artifact is missing, explain that the package needs `@rsdoctor/rspack-plugin` and an explicit `RSTACK_CONTEXT=1 RSDOCTOR=true RSDOCTOR_OUTPUT=json rs build` or `rs lib` run, then ask before any install or build.
3. Call `dead_code_explain` with the selected `contextId`. Set `maxDepth` from 1 to 16 only when the
   user needs a tighter or wider traversal.
4. Lead with the returned classification: **reachable**, **preserved by a conservative root**,
   **unreachable module candidate**, or **insufficient evidence**.
5. Show one shortest returned root-to-module path when present, naming its root kind and modules in order.
6. Report every state axis: production reachability, public contract, shipped, and optimizer retention.
7. Close with evidence, bounds, and provenance, including `artifactBinding` and build observation when available.

Do not infer local-symbol or export usage. Treat partial or truncated traversal as insufficient evidence, and describe all conclusions as limited to the explicit artifact graph.
