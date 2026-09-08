# SWC next formatter PoC

This branch replaces the default Yuku parser in `rs fmt` with SWC Next 0.2.0 while retaining Prettier's ESTree printer and the existing formatting adapter.

`swc_next_bridge = "=0.2.0"` compiles parsing and serialization into the existing rstack native binding. A thin NAPI function returns a Buffer to `@swc-next/decoder@0.2.0`; the generated loader is resolved lazily when parsing starts. No parser npm package or separate SWC Next native binary is installed.

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

Native changes also require `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`, and `cargo test --workspace --locked`.

## Compatibility and limits

SWC Next 0.2.0 accepts function implementations in declaration files, for example `export function value() { return 1; }` in `example.d.ts`. Yuku previously rejected this with an ambient-context diagnostic. The tests explicitly record this upstream difference; valid declarations, comments, Unicode locations, JSX/TSX, CommonJS, pragmas, and syntax errors remain covered. No fallback to another parser hides SWC Next errors.

Validation is on macOS arm64 with the repository's Node.js, pnpm, and Rust versions. The complete formatter/CLI suite covers worker execution, stdin, LSP, Vue, Svelte, and caching. Cross-platform binaries and formatter-wide conformance against Prettier's upstream corpus have not been validated. No throughput advantage is claimed by this PoC.

## Upstream

[SWC Next 0.2.0 source](https://github.com/swc-project/swc-next/tree/v0.2.0)
