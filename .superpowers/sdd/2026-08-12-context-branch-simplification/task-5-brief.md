### Task 5: simplify report lookup and align documentation

**Files:**

- Modify: `packages/rstack/src/context/rsdoctor.ts`
- Modify: `packages/rstack/src/context/report.ts`
- Modify: `packages/rstack/tests/context/report.test.ts`
- Modify: `website/docs/en/guide/cli/mcp.mdx`
- Modify: `website/docs/zh/guide/cli/mcp.mdx`
- Modify: `docs/rfcs/0001-rstack-context-engine.md`
- Modify: `docs/superpowers/plans/2026-08-12-rsdoctor-context.md`
- Modify: `docs/superpowers/plans/2026-08-12-context-branch-simplification.md`

**Interfaces:**

- Report lookup returns a discriminated `missing | file` result instead of requiring callers to
  inspect exception messages.
- Report links use ordinary resolved file URIs; no server or command is started.

- [x] **Step 1: write typed-outcome report tests and verify RED**

Cover missing conventional report, one valid sibling, ambiguous siblings, and manifest fallback.
Assert no control flow depends on an exception message.

- [x] **Step 2: implement the typed boundary**

Use ordinary resolved paths and `stat` to return discriminated outcomes. The report resolver owns
file lookup directly and consumes typed outcomes.

- [x] **Step 3: align English, Chinese, and RFC status**

Document the exact three-tool Phase 1 surface, direct Rsdoctor JSON contract, optional GUI links, and
deferred retention. Update both branch planning documents to match the implemented functional
contract, rewriting only the minimum surrounding sentences needed to keep them readable as
implementation history.

- [x] **Step 4: run full verification and commit**

Run `pnpm check`, `pnpm check:spell`, `pnpm build`,
`pnpm --filter rstack build:native`, and `pnpm test`; commit as
`docs: align the lean context foundation`.
