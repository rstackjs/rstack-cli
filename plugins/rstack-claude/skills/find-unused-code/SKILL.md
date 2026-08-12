---
name: find-unused-code
description: Find artifact-scoped Rstack modules unreachable from observed product roots. Use this skill when listing or prioritizing module-level unused-code candidates in an explicit Rsdoctor artifact; it does not analyze local symbols.
---

# Find unused code

1. Call `project_status` and select the context whose package root, product, environment, and target
   match the user's build. If none exists, explain that a relevant Rstack build must publish a
   context and stop; deduplicate repeated runs by `contextId`, and ask the user to choose only if
   several distinct contexts match.
2. Obtain the user's explicit Rsdoctor `dataFile`; do not discover or generate an artifact implicitly.
3. Call `product_roots` with `contextId` and `dataFile`. Summarize production, published-contract, and conservative roots plus graph issues.
4. Call `unused_candidates` with the same inputs and an optional `limit` from 1 to 100.
5. Choose the strongest returned candidate from its confidence, state, evidence, and bounds. Call `dead_code_explain` for that module.
6. Report why it is a candidate, the exhausted root sets, state axes, analysis/result truncation, bounds, and provenance.

Call every result an **artifact-scoped unreachable module candidate**. Recommend source and runtime verification before editing. Never equate a candidate with an unused local symbol or recommend deletion from this evidence alone.
