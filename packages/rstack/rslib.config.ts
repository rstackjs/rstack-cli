import { defineConfig } from '@rslib/core';
import pkgJson from './package.json' with { type: 'json' };

export default defineConfig({
  lib: [{ syntax: 'es2023', dts: true }],
  source: {
    entry: {
      index: './src/index.ts',
      rsbuildConfig: './src/rsbuildConfig.ts',
      rslibConfig: './src/rslibConfig.ts',
      rstestConfig: './src/rstestConfig.ts',
    },
    define: {
      RSTACK_VERSION: JSON.stringify(pkgJson.version),
    },
  },
});
