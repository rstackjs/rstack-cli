import { defineConfig } from '@rslib/core';
import pkgJson from './package.json' with { type: 'json' };

const fullyMinifiedChunks = /lintStaged\.js$/;

export default defineConfig({
  lib: [{ syntax: 'es2023', dts: true }],
  source: {
    entry: {
      index: './src/index.ts',
      rsbuildConfig: './src/rsbuildConfig.ts',
      rslibConfig: './src/rslibConfig.ts',
      rslintConfig: './src/rslintConfig.ts',
      rspressConfig: './src/rspressConfig.ts',
      rstestConfig: './src/rstestConfig.ts',
      app: './src/app.ts',
      lib: './src/lib.ts',
      lint: './src/lint.ts',
      test: './src/test.ts',
    },
    define: {
      RSTACK_VERSION: JSON.stringify(pkgJson.version),
    },
  },
  output: {
    // Rstack always passes an explicit config object to lint-staged, so its
    // optional YAML config loader is not used.
    externals: ['jiti', 'yaml'],
    minify: {
      js: true,
      css: false,
      jsOptions: [
        {
          // Fully minify the bundled lint-staged code to reduce package size.
          include: fullyMinifiedChunks,
        },
        {
          exclude: fullyMinifiedChunks,
          minimizerOptions: {
            // Preserve variable names and disable minification for easier debugging.
            mangle: false,
            minify: false,
            compress: {
              keep_fnames: true,
            },
          },
        },
      ],
    },
  },
});
