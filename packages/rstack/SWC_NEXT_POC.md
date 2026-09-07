# SWC next formatter PoC

This branch replaces the default Yuku parser in `rs fmt` with SWC Next 0.2.0 while retaining Prettier's ESTree printer and the existing formatting adapter.

`@swc-next/parser@0.2.0` supplies its own platform-specific native binding and decodes its output internally. The rstack native binding is unchanged.

Inferred JavaScript, JSX, TypeScript, TSX, and embedded script formatting use SWC Next. Explicit `babel` and `typescript` options still select Prettier's own parsers, and project plugins retain precedence. The experimental explicit parser names are `swc-next` and `swc-next-ts`, replacing `yuku` and `yuku-ts`.

The cache namespace includes the parser version and integration route so switching between the original formatter and either PoC cannot reuse stale formatting results. The decoder and Rust serializer must be upgraded together; all SWC Next packages in this PoC are locked to 0.2.0.

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

SWC Next 0.2.0 accepts function implementations in declaration files, for example `export function value() { return 1; }` in `example.d.ts`. Yuku previously rejected this with an ambient-context diagnostic. The tests explicitly record this upstream difference; valid declarations, comments, Unicode locations, JSX/TSX, CommonJS, pragmas, and syntax errors remain covered. No fallback to another parser hides SWC Next errors.

Validation is on macOS arm64 with the repository's Node.js, pnpm, and Rust versions. The complete formatter/CLI suite covers worker execution, stdin, LSP, Vue, Svelte, and caching. Cross-platform binaries and formatter-wide conformance against Prettier's upstream corpus have not been validated. No throughput advantage is claimed by this PoC.

## Upstream

[SWC Next 0.2.0 source](https://github.com/swc-project/swc-next/tree/v0.2.0)
