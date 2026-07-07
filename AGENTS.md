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

## Project structure

```text
packages/rstack/       # CLI package
examples/*             # example projects
scripts/               # repo tooling
```
