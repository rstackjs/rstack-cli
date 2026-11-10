# Nx + Rstack

## Setup

```bash
pnpm install
```

## Structure

- `apps/web`: React application.
- `packages/ui`: Shared UI components.
- `tsconfig.base.json`: Shared TypeScript configuration.

## Scripts

Run from the repository root:

- `pnpm run build`: Build all packages.
- `pnpm run dev`: Start the web app and watch the shared UI package.
- `pnpm run test`: Run tests.
- `pnpm run check`: Run lint, formatting, and TypeScript checks.
- `pnpm run lint`: Lint the workspace.
- `pnpm run format`: Format the workspace.

Nx discovers projects and tasks from workspace package manifests. Build and test tasks are cached, and dependencies are built first.

The root `.env` disables Nx's environment-file loading so Rstack can load each project's environment files with the correct mode and priority.

Run `pnpm run build` before `pnpm run check`.

Use `pnpm exec nx graph` to explore the project graph.

## Learn more

- [Rstack CLI monorepo guide](https://rstack.rs/guide/monorepo)
- [Nx documentation](https://nx.dev/docs/getting-started/intro)
