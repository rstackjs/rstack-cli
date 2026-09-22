# SWC next formatter PoC

This branch replaces the default Yuku parser in `rs fmt` with SWC Next 0.2.2 while retaining Prettier's ESTree printer and the existing formatting adapter.

`@swc-next/parser@0.2.2` supplies its own platform-specific native binding and decodes its output internally. The rstack native binding is unchanged.

Inferred JavaScript, JSX, TypeScript, TSX, and embedded script formatting use SWC Next. Explicit `babel` and `typescript` options still select Prettier's own parsers, and project plugins retain precedence. The experimental explicit parser names are `swc-next` and `swc-next-ts`, replacing `yuku` and `yuku-ts`.

The cache namespace includes the installed parser version so parser upgrades invalidate existing formatting results. The decoder and Rust serializer must be upgraded together; all SWC Next packages in this PoC are locked to 0.2.2.

## Try it

```sh
pnpm install
pnpm build
pnpm --filter rstack build:native
printf 'const view=<Component value={{foo:1}} />' | pnpm exec rs fmt --stdin-filepath example.tsx
pnpm test
pnpm check
```

## Compatibility and limits

SWC Next 0.2.2 reports diagnostics for function implementations in declaration files, restoring the formatter's existing rejection behavior. It also parses the typed arrow callback inside the conditional expression that previously failed when formatting Rsbuild's `inspectConfig.ts` with 0.2.0. Tests cover both cases, alongside valid declarations, comments, Unicode locations, JSX/TSX, CommonJS, pragmas, and syntax errors. Parser errors stop formatting without falling back to another parser.

Validation is on macOS arm64 with the repository's Node.js, pnpm, and Rust versions. The complete formatter/CLI suite covers worker execution, stdin, LSP, Vue, Svelte, and caching. Cross-platform binaries and formatter-wide conformance against Prettier's upstream corpus have not been validated. No throughput advantage is claimed by this PoC.

## Upstream

[SWC Next 0.2.2 source](https://github.com/swc-project/swc-next/tree/v0.2.2)
