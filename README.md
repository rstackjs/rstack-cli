# Rstack CLI

<p>
  <a href="https://discord.gg/XsaKEEk4mW"><img src="https://img.shields.io/badge/chat-discord-blue?style=flat-square&logo=discord&colorA=564341&colorB=EDED91" alt="discord channel" /></a>
  <a href="https://npmjs.com/package/rstack?activeTab=readme"><img src="https://img.shields.io/npm/v/rstack?style=flat-square&colorA=564341&colorB=EDED91" alt="npm version" /></a>
  <a href="https://npmcharts.com/compare/rstack"><img src="https://img.shields.io/npm/dm/rstack.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="downloads" /></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/rstack.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="node version"></a>
  <a href="https://github.com/rstackjs/rstack/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square&colorA=564341&colorB=EDED91" alt="license" /></a>
</p>

Rstack CLI is a unified local CLI for web development.

It brings the Rstack toolchain together behind one local CLI, including [Rsbuild](https://github.com/web-infra-dev/rsbuild), [Rslib](https://github.com/web-infra-dev/rslib), [Rstest](https://github.com/web-infra-dev/rstest), [Rslint](https://github.com/web-infra-dev/rslint), and [Rspress](https://github.com/web-infra-dev/rspress). It also includes built-in formatting support via [Oxfmt](https://github.com/oxc-project/oxc).

Rstack CLI unifies the Rstack toolchain without locking you into a new workflow. Use it alongside [pnpm](https://github.com/pnpm/pnpm), [Turborepo](https://github.com/vercel/turborepo), [Nx](https://github.com/nrwl/nx), [Bun](https://github.com/oven-sh/bun), or whatever already works for your project.

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
    "preview": "rs preview"
  }
}
```

Then run the scripts with your preferred package manager:

```bash
pnpm dev
pnpm build
pnpm preview
```

## License

[MIT](./LICENSE).
