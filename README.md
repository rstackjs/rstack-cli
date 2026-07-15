# Rstack CLI

<p>
  <a href="https://discord.gg/XsaKEEk4mW"><img src="https://img.shields.io/badge/chat-discord-blue?style=flat-square&logo=discord&colorA=564341&colorB=EDED91" alt="discord channel" /></a>
  <a href="https://npmjs.com/package/rstack?activeTab=readme"><img src="https://img.shields.io/npm/v/rstack?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" /></a>
  <a href="https://npmcharts.com/compare/rstack"><img src="https://img.shields.io/npm/dm/rstack.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" /></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/rstack.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="node version"></a>
  <a href="https://github.com/rstackjs/rstack-cli/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="license" /></a>
</p>

Rstack CLI brings the Rstack toolchain together for JavaScript development, with one CLI, one configuration, and one consistent workflow.

It also covers local development needs outside Rstack's scope, with Oxfmt formatting and lint-staged commands.

| Command      | Description                      | Powered by                                                |
| ------------ | -------------------------------- | --------------------------------------------------------- |
| `rs dev`     | Run the app dev server           | [Rsbuild](https://github.com/web-infra-dev/rsbuild)       |
| `rs build`   | Build the app for production     | [Rsbuild](https://github.com/web-infra-dev/rsbuild)       |
| `rs preview` | Preview the app production build | [Rsbuild](https://github.com/web-infra-dev/rsbuild)       |
| `rs test`    | Run tests                        | [Rstest](https://github.com/web-infra-dev/rstest)         |
| `rs lint`    | Lint code                        | [Rslint](https://github.com/web-infra-dev/rslint)         |
| `rs lib`     | Build library                    | [Rslib](https://github.com/web-infra-dev/rslib)           |
| `rs doc`     | Serve or build docs              | [Rspress](https://github.com/web-infra-dev/rspress)       |
| `rs fmt`     | Format code (TODO)               | [Oxfmt](https://github.com/oxc-project/oxc)               |
| `rs setup`   | Set up Git hooks (TODO)          | -                                                         |
| `rs staged`  | Run tasks on staged Git files    | [lint-staged](https://github.com/lint-staged/lint-staged) |

Rstack CLI fits into your existing project workflow. It does not replace your runtime, package manager, or task runner, such as [pnpm](https://github.com/pnpm/pnpm), [Bun](https://github.com/oven-sh/bun), [Turborepo](https://github.com/vercel/turborepo), [Nx](https://github.com/nrwl/nx), and [Nub](https://github.com/nubjs/nub).

## Current status

Rstack CLI is currently experimental and mainly used for internal validation. Its APIs, configuration, and usage may change as the project evolves.

Welcome to try it out and share feedback through issues and discussions!

## Skills

### Best practice

Rstack CLI is still new and does not have complete documentation yet.

Installing the Rstack CLI skill so the agent can understand how to use it:

```bash
npx skills add rstackjs/rstack-cli --skill rstack-cli-best-practices
```

### Migration

Installing the migration skill so the agent can migrate existing projects to Rstack CLI:

```bash
npx skills add rstackjs/rstack-cli --skill migrate-to-rstack-cli
```

## Usage

1. Install `rstack` in your project:

```bash
# pnpm
pnpm add -D rstack
# yarn
yarn add -D rstack
# npm
npm add -D rstack
# bun
bun add -d rstack
```

2. Add scripts to your `package.json`:

```json
{
  "scripts": {
    "dev": "rs dev",
    "build": "rs build",
    "preview": "rs preview",
    "test": "rs test",
    "lint": "rs lint",
    "lib": "rs lib",
    "doc": "rs doc"
  }
}
```

Run the scripts with your preferred package manager:

```bash
pnpm dev
pnpm build
pnpm preview
pnpm test
pnpm lint
pnpm lib
pnpm doc
```

## API imports

Rstack re-exports the APIs of its underlying tools through dedicated entry points:

| Tool    | Import path   |
| ------- | ------------- |
| Rsbuild | `rstack/app`  |
| Rslib   | `rstack/lib`  |
| Rslint  | `rstack/lint` |
| Rstest  | `rstack/test` |

For example, import Rstest APIs without adding `@rstest/core` as a direct dependency:

```ts
import { expect, test } from 'rstack/test';
```

## Credits

Rstack CLI is inspired by:

- [Cargo](https://github.com/rust-lang/cargo)
- [Deno](https://github.com/denoland/deno)
- [Bun](https://github.com/oven-sh/bun)
- [Vite Plus](https://github.com/voidzero-dev/vite-plus)

## License

[MIT](./LICENSE).
