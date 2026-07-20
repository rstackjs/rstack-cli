# AGENTS.md

## Stack

- Use repo Node.js/pnpm versions (`package.json`)
- `pnpm` workspace; shared deps in `pnpm-workspace.yaml` catalogs
- TypeScript, Rsbuild/Rslib/Rstest/Rslint, Oxfmt

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
pnpm --filter rstack test
```

## Testing

- Run `pnpm build` once before `pnpm test` command

## Documentation

- Keep corresponding content in `website/docs/en` and `website/docs/zh` aligned in structure, meaning, links, and examples.
- Keep corresponding heading anchors identical between `website/docs/en` and `website/docs/zh`. When a translated heading would generate a different anchor, add an explicit anchor matching the English heading, for example `## 配置 \{#configuration}`.

## Project structure

```text
packages/rstack/       # CLI package
examples/*             # example projects
scripts/               # repo tooling
```
