#!/usr/bin/env node
// Repository-only CLI entry for running Rstack from source without requiring dist.
import pkg from '../packages/rstack/package.json' with { type: 'json' };

// The published CLI receives this version at build time, so provide it before loading the source.
globalThis.RSTACK_VERSION = pkg.version;

const { runCLI } = await import('../packages/rstack/src/index.ts');

await runCLI();
