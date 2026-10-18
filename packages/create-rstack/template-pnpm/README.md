# pnpm workspace + Rstack

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

- `pnpm run build`: Build all packages in dependency order.
- `pnpm run dev`: Build shared packages, then start the web app and watch the shared UI package.
- `pnpm run test`: Build shared packages, then run tests.
- `pnpm run check`: Run lint, formatting, and TypeScript checks.
- `pnpm run lint`: Lint the workspace.
- `pnpm run format`: Format the workspace.

Run `pnpm run build` before `pnpm run check`.

Use `pnpm --filter <package-name> <script>` to run a script in one package.

## Learn more

- [Rstack CLI monorepo guide](https://rstack.rs/guide/monorepo)
- [pnpm workspace documentation](https://pnpm.io/workspaces)
