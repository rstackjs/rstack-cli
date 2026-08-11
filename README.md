# Rstack CLI

<p>
  <a href="https://discord.gg/XsaKEEk4mW"><img src="https://img.shields.io/badge/chat-discord-blue?style=flat-square&logo=discord&colorA=564341&colorB=EDED91" alt="discord channel" /></a>
  <a href="https://npmjs.com/package/rstack?activeTab=readme"><img src="https://img.shields.io/npm/v/rstack?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" /></a>
  <a href="https://npmcharts.com/compare/rstack"><img src="https://img.shields.io/npm/dm/rstack.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" /></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/rstack.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="node version"></a>
  <a href="https://github.com/rstackjs/rstack-cli/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="license" /></a>
</p>

Rstack CLI brings the Rstack toolchain together for JavaScript development, with one CLI, one configuration, and one consistent workflow.

It also covers local development needs outside Rstack's scope, with Prettier formatting and lint-staged commands.

| Command                                             | Description                                  |
| --------------------------------------------------- | -------------------------------------------- |
| [`rs dev`](https://rstack.rs/guide/cli/dev)         | Run the app dev server                       |
| [`rs build`](https://rstack.rs/guide/cli/build)     | Build the app for production                 |
| [`rs preview`](https://rstack.rs/guide/cli/preview) | Preview the app production build             |
| [`rs test`](https://rstack.rs/guide/cli/test)       | Run tests                                    |
| [`rs lint`](https://rstack.rs/guide/cli/lint)       | Lint code                                    |
| [`rs fmt`](https://rstack.rs/guide/cli/fmt)         | Format code                                  |
| [`rs check`](https://rstack.rs/guide/cli/check)     | Run static checks, including lint and format |
| [`rs lib`](https://rstack.rs/guide/cli/lib)         | Build library                                |
| [`rs doc`](https://rstack.rs/guide/cli/doc)         | Serve or build docs                          |
| [`rs setup`](https://rstack.rs/guide/cli/setup)     | Install Git hooks                            |
| [`rs staged`](https://rstack.rs/guide/cli/staged)   | Run tasks on staged Git files                |

Rstack CLI fits into your existing project workflow. It does not replace your runtime, package manager, or task runner, such as [pnpm](https://github.com/pnpm/pnpm), [Bun](https://github.com/oven-sh/bun), [Turborepo](https://github.com/vercel/turborepo), [Nx](https://github.com/nrwl/nx), and [Nub](https://github.com/nubjs/nub).

## Current status

Rstack CLI is currently experimental and mainly used for internal validation. Its APIs, configuration, and usage may change as the project evolves.

Welcome to try it out and share feedback through issues and discussions!

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
    "check": "rs check --type-check",
    "lint": "rs lint",
    "lib": "rs lib",
    "doc": "rs doc",
    "format": "rs fmt",
    "prepare": "rs setup"
  }
}
```

Run the scripts with your preferred package manager:

```bash
pnpm dev
pnpm build
pnpm preview
pnpm test
pnpm check
pnpm lint
pnpm lib
pnpm doc
pnpm format
```

## Credits

Rstack CLI is inspired by:

- [Bun](https://github.com/oven-sh/bun)
- [Cargo](https://github.com/rust-lang/cargo)
- [Deno](https://github.com/denoland/deno)
- [Oxfmt](https://github.com/oxc-project/oxc)
- [Vite Plus](https://github.com/voidzero-dev/vite-plus)

Parts of the Git hook implementation are derived from [Husky](https://github.com/typicode/husky), and parts of the formatter runtime are derived from [Prettier CLI](https://github.com/prettier/prettier-cli).

See [Third-Party Notices](./packages/rstack/THIRD_PARTY_NOTICES.md) for complete attribution and license information.

## License

[MIT](./LICENSE).
