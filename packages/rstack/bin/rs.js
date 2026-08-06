#!/usr/bin/env node
import nodeModule from 'node:module';

// enable on-disk code caching and share its directory with child workers
// requires Nodejs >= 22.8.0
const { enableCompileCache } = nodeModule;
if (enableCompileCache) {
  try {
    const { directory } = enableCompileCache();
    if (directory) {
      process.env.NODE_COMPILE_CACHE = directory;
    }
  } catch {
    // ignore errors
  }
}

async function main() {
  const { runCLI } = await import('../dist/index.js');
  runCLI();
}

main();
