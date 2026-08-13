# Rstack context

`@rstackjs/context` is the runtime behind the Rstack project-context MCP. It records and queries
checkout-local build, lint, test, coverage, and Rsdoctor evidence while keeping freshness,
completeness, and provenance explicit.

Most users install and invoke it through the `rstack` package:

```bash
rs mcp
```

The `rstack/context` export re-exports this package for programmatic consumers. Codex and Claude
Code workflow guidance is distributed separately by
[`rstackjs/agent-skills`](https://github.com/rstackjs/agent-skills).
