import { defineConfig } from '@rslib/core';
import prettierPkgJson from 'prettier/package.json' with { type: 'json' };
import pkgJson from './package.json' with { type: 'json' };

const fullyMinifiedChunks = /(?:fmt(?:Plugins)?|sortPackageJsonPlugin|staged)\.js$/;

export default defineConfig({
  dts: true,
  syntax: 'es2023',
  source: {
    entry: {
      index: './src/index.ts',
      configExports: './src/configExports.ts',
      rsbuildConfig: './src/rsbuildConfig.ts',
      rslibConfig: './src/rslibConfig.ts',
      rslintConfig: './src/rslintConfig.ts',
      rspressConfig: './src/rspressConfig.ts',
      rstestConfig: './src/rstestConfig.ts',
      app: './src/app.ts',
      lib: './src/lib.ts',
      lint: './src/lint.ts',
      test: './src/test.ts',
      'native/index': './src/native/index.ts',
      fmtWorker: './src/fmt/worker.ts',
    },
    define: {
      PRETTIER_VERSION: JSON.stringify(prettierPkgJson.version),
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
          // Fully minify formatter and staged command bundles to reduce package size.
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
  tools: {
    rspack: {
      module: {
        parser: {
          javascript: {
            // @rstest/adapter-rslib resolves extended tsconfig paths from a runtime base.
            createRequire: false,
          },
        },
      },
    },
  },
});
