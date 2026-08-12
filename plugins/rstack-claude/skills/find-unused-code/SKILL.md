---
name: find-unused-code
description: Find artifact-scoped Rstack module candidates that are unreachable from observed product roots. Use for requests to locate unused modules or prioritize dead-code investigation in an explicit Rsdoctor build artifact.
---

# Find unused code

Require the project's `rs` executable to be available on the MCP host's `PATH`.

1. Call `project_status` and select the relevant ready context. Do not invent a context when the choice is ambiguous.
2. Obtain the user's explicit Rsdoctor `dataFile`; do not discover or generate an artifact implicitly.
3. Call `product_roots` with `contextId` and `dataFile`. Summarize production, published-contract, and conservative roots plus graph issues.
4. Call `unused_candidates` with the same inputs and an optional `limit` from 1 to 100.
5. Choose the strongest returned candidate from its confidence, state, evidence, and bounds. Call `dead_code_explain` for that module.
6. Report why it is a candidate, the exhausted root sets, state axes, analysis/result truncation, bounds, and provenance.

Call every result an **artifact-scoped unreachable module candidate**. Recommend source and runtime verification before editing. Never equate a candidate with an unused local symbol or recommend deletion from this evidence alone.
