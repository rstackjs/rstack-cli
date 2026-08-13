---
name: find-unused-code
description: Find artifact-scoped Rstack modules unreachable from observed product roots. Use this skill when listing or prioritizing module-level unused-code candidates in an explicit Rsdoctor artifact; it does not analyze local symbols.
---

# Find unused code

1. Call `project_status` and select the context whose package root, product, environment, and target
   match the user's build. Deduplicate repeated runs by `contextId`, and ask the user to choose only
   if several distinct contexts match.
2. Classify the requested subject. An artifact module selector is a module ID, exact module path or
   name, or unique path suffix from the Rsdoctor artifact. For a local symbol such as a function,
   class, or export, route the question to source-level lint, TypeScript, or static analysis.
3. Obtain the user's explicit Rsdoctor `dataFile`. When the matching build context or artifact is
   missing, identify the configured product and give its exact minimal capture command:
   `RSTACK_CONTEXT=1 RSDOCTOR=true RSDOCTOR_OUTPUT=json rs build` for an application or
   `RSTACK_CONTEXT=1 RSDOCTOR=true RSDOCTOR_OUTPUT=json rs lib` for a library. Explain that the
   package needs `@rsdoctor/rspack-plugin`. Ask before running a capture or installation.
4. Call `product_roots` with `contextId` and `dataFile`. Summarize production, published-contract,
   and conservative roots plus graph issues.
5. Call `unused_candidates` with the same inputs and an optional `limit` from 1 to 100. While
   `nextCursor` is returned, continue with that cursor and the same `contextId`, `dataFile`, and
   `limit`.
6. Choose the strongest returned candidate across all pages from its confidence, state, evidence,
   and bounds. Call
   `dead_code_explain` for that module.
7. When runtime or test evidence would help prioritize that candidate, call `code_evidence` with
   its exact checkout-relative path and the same explicit `contextId` and `dataFile`. Keep execution
   coverage, test outcome, diagnostics, and module state separate; no one axis proves another.
   Check `diagnostics.truncated`; when true, report the returned and total counts instead of
   presenting the diagnostic items as exhaustive.
8. Report why it is a candidate, the exhausted root sets, state axes, analysis/result truncation,
   bounds, and provenance.

Call every result an **artifact-scoped unreachable module candidate**. State that completely
unimported files never entered the artifact graph and are outside this analysis. Recommend source
and runtime verification before editing. Never equate a candidate with an unused local symbol or
recommend deletion from this evidence alone. Observed or unobserved aggregate execution does not
prove code is dead.
