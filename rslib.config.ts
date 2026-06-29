import { defineConfig } from '@rslib/core';
import pkgJson from './package.json' with { type: 'json' };

export default defineConfig({
  lib: [{ syntax: 'es2023', dts: true }],
  source: {
    define: {
      RSTACK_VERSION: JSON.stringify(pkgJson.version),
    },
  },
});
