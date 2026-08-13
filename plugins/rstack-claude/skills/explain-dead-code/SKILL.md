---
name: explain-dead-code
description: Explain whether one Rstack artifact module is reachable, conservatively preserved, an unreachable candidate, or unsupported. Use this skill when answering why one module is included, retained, or apparently unused; it does not analyze local symbols.
---

# Explain dead code

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
4. Call `dead_code_explain` with the selected `contextId` and artifact module selector. Set
   `maxDepth` from 1 to 32 only when the user needs a tighter traversal than the default 32.
5. Lead with the returned classification: **reachable**, **preserved by a conservative root**,
   **unreachable module candidate**, or **insufficient evidence**.
6. Show one shortest returned root-to-module path when present, naming its root kind and modules in order.
7. Report every state axis: production reachability, public contract, shipped, and optimizer retention.
8. When runtime or test evidence would help, call `code_evidence` with the exact checkout-relative
   path, the same explicit `contextId` and `dataFile`, and the same artifact module selector as
   `module`. Keep execution coverage, test outcome, diagnostics, and module state separate; no one
   axis proves another.
   Check `diagnostics.truncated`; when true, report the returned and total counts instead of
   presenting the diagnostic items as exhaustive.
9. Close with evidence, bounds, and provenance, including `artifactBinding` and build observation when available.

Do not infer local-symbol or export usage. Treat partial or truncated traversal as insufficient
evidence, and describe all conclusions as limited to the explicit artifact graph. Observed or
unobserved aggregate execution does not prove code is dead.
