# AGENTS.md

## Stack

- Use repo Node.js/pnpm versions (`package.json`)
- `pnpm` workspace; shared deps in `pnpm-workspace.yaml` catalogs
- TypeScript, Rsbuild/Rslib/Rstest/Rslint, Prettier
- Rust/Cargo workspace with a NAPI-RS binding under `crates/`

## Commands

```bash
# setup
corepack enable && pnpm install

# dev checks
pnpm lint
pnpm test

# build / format / spelling
pnpm build
pnpm format
pnpm check:format
pnpm check:spell

# focused work
pnpm --filter rstack build
pnpm --filter rstack build:native
pnpm --filter rstack test
```

## Testing

- Run `pnpm build` and `pnpm --filter rstack build:native` before `pnpm test`

## Native

- Follow `crates/AGENTS.md` for Rust changes
- Keep the JS bridge lazy; use the generated loader directly
- Regenerate binding files with `build:native`

## Documentation

- Keep corresponding content in `website/docs/en` and `website/docs/zh` aligned in structure, meaning, links, and examples.
- Keep corresponding heading anchors identical between `website/docs/en` and `website/docs/zh`. When a translated heading would generate a different anchor, add an explicit anchor matching the English heading, for example `## 配置 \{#configuration}`.

## Project structure

```text
crates/                 # Rust crates
packages/rstack/        # CLI package and private native bridge
examples/*              # example projects
scripts/                # repo tooling
```
