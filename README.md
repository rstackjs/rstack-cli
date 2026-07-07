# Rstack CLI

<p>
  <a href="https://discord.gg/XsaKEEk4mW"><img src="https://img.shields.io/badge/chat-discord-blue?style=flat-square&logo=discord&colorA=564341&colorB=EDED91" alt="discord channel" /></a>
  <a href="https://npmjs.com/package/rstack?activeTab=readme"><img src="https://img.shields.io/npm/v/rstack?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" /></a>
  <a href="https://npmcharts.com/compare/rstack"><img src="https://img.shields.io/npm/dm/rstack.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" /></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/rstack.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="node version"></a>
  <a href="https://github.com/rstackjs/rstack/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="license" /></a>
</p>

Rstack CLI brings the Rstack toolchain together for JavaScript development, with one CLI, one configuration, and one consistent workflow.

It also covers local development needs outside Rstack's scope, with Oxfmt formatting and lint-staged commands.

| Command      | Description                   | Powered by                                                |
| ------------ | ----------------------------- | --------------------------------------------------------- |
| `rs dev`     | Start a local app dev server  | [Rsbuild](https://github.com/web-infra-dev/rsbuild)       |
| `rs build`   | Create a production app build | [Rsbuild](https://github.com/web-infra-dev/rsbuild)       |
| `rs preview` | Preview the production build  | [Rsbuild](https://github.com/web-infra-dev/rsbuild)       |
| `rs test`    | Run the test suite            | [Rstest](https://github.com/web-infra-dev/rstest)         |
| `rs lint`    | Lint and type-check code      | [Rslint](https://github.com/web-infra-dev/rslint)         |
| `rs lib`     | Build library outputs         | [Rslib](https://github.com/web-infra-dev/rslib)           |
| `rs doc`     | Develop and build docs (TODO) | [Rspress](https://github.com/web-infra-dev/rspress)       |
| `rs fmt`     | Format code (TODO)            | [Oxfmt](https://github.com/oxc-project/oxc)               |
| `rs setup`   | Setup git hooks (TODO)        | -                                                         |
| `rs staged`  | Run tasks for staged files    | [lint-staged](https://github.com/lint-staged/lint-staged) |

Rstack CLI fits into your existing project workflow. It does not replace your runtime, package manager, or task runner, such as [pnpm](https://github.com/pnpm/pnpm), [Bun](https://github.com/oven-sh/bun), [Turborepo](https://github.com/vercel/turborepo), [Nx](https://github.com/nrwl/nx), and [Nub](https://github.com/nubjs/nub).

## Current status

Rstack CLI is currently experimental and mainly used for internal validation. Its APIs, configuration, and usage may change as the project evolves.

Welcome to try it out and share feedback through issues and discussions!

## Features

- **Unified local CLI**: run Rstack tools through a single `rs` command
- **Single configuration**: configure all tools from one configuration file

## Usage

Install `rstack` in your project and call it from package scripts:

```bash
# npm
npm add -D rstack
# pnpm
pnpm add -D rstack
# yarn
yarn add -D rstack
# bun
bun add -d rstack
```

Then run the scripts with your preferred package manager:

```bash
pnpm dev
pnpm build
pnpm preview
pnpm lib
pnpm test
```

## Credits

Rstack CLI is inspired by:

- [Cargo](https://github.com/rust-lang/cargo)
- [Deno](https://github.com/denoland/deno)
- [Bun](https://github.com/oven-sh/bun)
- [Vite Plus](https://github.com/voidzero-dev/vite-plus)

## License

[MIT](./LICENSE).
