---
name: explain-dead-code
description: Explain whether an Rstack module is reachable, conservatively preserved, an unreachable candidate, or unsupported by available evidence. Use for why-included or why-unused questions about one module in an explicit Rsdoctor artifact.
---

# Explain dead code

Require the project's `rs` executable to be available on the MCP host's `PATH`.

1. Obtain the exact `contextId`, explicit Rsdoctor `dataFile`, and module ID, exact path/name, or unique path suffix.
2. Call `dead_code_explain`. Set `maxDepth` from 1 to 16 only when the user needs a tighter or wider traversal.
3. Lead with the returned classification: **reachable**, **preserved by a conservative root**, **unreachable module candidate**, or **insufficient evidence**.
4. Show one shortest returned root-to-module path when present, naming its root kind and modules in order.
5. Report every state axis: production reachability, public contract, shipped, and optimizer retention.
6. Close with evidence, bounds, and provenance, including `artifactBinding` and build observation when available.

Do not infer local-symbol or export usage. Treat partial or truncated traversal as insufficient evidence, and describe all conclusions as limited to the explicit artifact graph.
