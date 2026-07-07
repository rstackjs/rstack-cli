# Rstack CLI

<p>
  <a href="https://discord.gg/XsaKEEk4mW"><img src="https://img.shields.io/badge/chat-discord-blue?style=flat-square&logo=discord&colorA=564341&colorB=EDED91" alt="discord channel" /></a>
  <a href="https://npmjs.com/package/rstack?activeTab=readme"><img src="https://img.shields.io/npm/v/rstack?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" /></a>
  <a href="https://npmcharts.com/compare/rstack"><img src="https://img.shields.io/npm/dm/rstack.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" /></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/rstack.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="node version"></a>
  <a href="https://github.com/rstackjs/rstack/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="license" /></a>
</p>

Rstack CLI brings the Rstack toolchain together for JavaScript development, with one CLI and one consistent workflow.

It provides one place to run and configure [Rsbuild](https://github.com/web-infra-dev/rsbuild), [Rslib](https://github.com/web-infra-dev/rslib), [Rstest](https://github.com/web-infra-dev/rstest), [Rslint](https://github.com/web-infra-dev/rslint), and [Rspress](https://github.com/web-infra-dev/rspress).

It also covers common local development tasks, with formatting powered by [Oxfmt](https://github.com/oxc-project/oxc) and staged-file commands powered by [lint-staged](https://github.com/lint-staged/lint-staged), giving Rstack projects a complete development experience out of the box.

Rstack CLI fits into your existing project workflow. It does not replace your runtime, package manager, or task runner, such as [pnpm](https://github.com/pnpm/pnpm), [Bun](https://github.com/oven-sh/bun), [Turborepo](https://github.com/vercel/turborepo), [Nx](https://github.com/nrwl/nx), and [Nub](https://github.com/nubjs/nub). Instead, it focuses on providing one place to run and configure Rstack tools.

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

```json
{
  "scripts": {
    "dev": "rs dev",
    "build": "rs build",
    "preview": "rs preview",
    "lib": "rs lib",
    "test": "rs test",
    "staged": "rs staged"
  }
}
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
