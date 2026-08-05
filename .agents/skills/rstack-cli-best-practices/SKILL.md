---
name: rstack-cli-best-practices
description: Guidance for Rstack CLI work involving `rs` commands, `rstack.config.*`, package APIs, or Rstack-based projects and tooling.
---

# Rstack CLI Best Practices

## Rstack: ALWAYS read installed docs before working

Before any Rstack work, find and read the relevant Markdown documentation shipped with the
installed `rstack` package. Model knowledge and summaries in this skill can be outdated; the
installed documentation is the source of truth for the project's Rstack version.

1. Start with `node_modules/rstack/dist/docs/llms.txt`, then read only the linked pages relevant to
   the task before proposing or making changes.

2. If `llms.txt` is unavailable, start with `node_modules/rstack/dist/docs/index.md` and search the
   documentation directory with `rg -n "<keyword>" node_modules/rstack/dist/docs`.

3. For exact CLI flags and behavior, also run `rs -h` or `rs <command> -h` when supported.

If the bundled docs are not available at that path, locate the installed `rstack` package. If they
are still unavailable, verify that `rstack` is installed, report the installed version, and use CLI
help plus the online Rstack documentation as a fallback. Do not guess from model memory.
