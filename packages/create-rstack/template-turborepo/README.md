# Rstack + Turborepo

## Setup

```bash
pnpm install
```

## Structure

- `apps/web`: React application.
- `packages/ui`: Shared UI components.
- `packages/tsconfig`: Shared TypeScript configuration.

## Scripts

Run from the repository root:

- `pnpm run build`: Build all packages.
- `pnpm run dev`: Start development.
- `pnpm run test`: Run tests.
- `pnpm run check`: Run lint, formatting, and TypeScript checks.
- `pnpm run lint`: Lint the workspace.
- `pnpm run format`: Format the workspace.

Run `pnpm run build` before `pnpm run check`.

## Learn more

- [Rstack CLI monorepo guide](https://rstack.rs/guide/monorepo)
- [Turborepo documentation](https://turborepo.com/docs)
