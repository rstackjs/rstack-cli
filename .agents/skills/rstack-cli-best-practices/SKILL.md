---
name: rstack-cli-best-practices
description: Guidance for Rstack CLI work involving `rs` commands, `rstack.config.*`, package APIs, or Rstack-based projects and tooling.
---

# Rstack CLI Best Practices

## Rstack: ALWAYS read installed docs before working

Before any Rstack work, find and read the relevant Markdown documentation shipped with the
installed `rstack` package. Model knowledge and summaries in this skill can be outdated; the
installed documentation is the source of truth for the project's Rstack version.

1. Read only the pages relevant to the task under `node_modules/rstack/dist/docs` before proposing
   or making changes.

2. If the correct page is unclear, start with the documentation index and search the documentation
   root with `rg -n "<keyword>" <docs-root>`.

3. For exact CLI flags and behavior, also run `rs -h` or `rs <command> -h` when supported.

If the bundled docs are not available at that path, locate the installed `rstack` package. If they
are still unavailable, verify that `rstack` is installed, report the installed version, and use CLI
help plus the online Rstack documentation as a fallback. Do not guess from model memory.

## Documentation map

These links target the usual project-local skill installation. If a link does not resolve, open
the same relative path under the resolved documentation root.

- [Overview](../../../node_modules/rstack/dist/docs/index.md)
- [Quick start and command overview](../../../node_modules/rstack/dist/docs/guide/quick-start.md)
- [Configuration](../../../node_modules/rstack/dist/docs/guide/configuration.md)
- [API and import paths](../../../node_modules/rstack/dist/docs/guide/api-reference.md)
- [Monorepos](../../../node_modules/rstack/dist/docs/guide/monorepo.md)
- [Testing](../../../node_modules/rstack/dist/docs/guide/testing.md)
- [Formatting](../../../node_modules/rstack/dist/docs/guide/formatting.md)
- CLI commands: [dev](../../../node_modules/rstack/dist/docs/guide/cli/dev.md),
  [build](../../../node_modules/rstack/dist/docs/guide/cli/build.md),
  [preview](../../../node_modules/rstack/dist/docs/guide/cli/preview.md),
  [lib](../../../node_modules/rstack/dist/docs/guide/cli/lib.md),
  [doc](../../../node_modules/rstack/dist/docs/guide/cli/doc.md),
  [test](../../../node_modules/rstack/dist/docs/guide/cli/test.md),
  [lint](../../../node_modules/rstack/dist/docs/guide/cli/lint.md),
  [fmt](../../../node_modules/rstack/dist/docs/guide/cli/fmt.md),
  [setup](../../../node_modules/rstack/dist/docs/guide/cli/setup.md), and
  [staged](../../../node_modules/rstack/dist/docs/guide/cli/staged.md)
