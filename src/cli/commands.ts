import cac from 'cac';
import { logger } from '@rsbuild/core';
import { initRsbuild } from './rsbuild.js';
import type { BuildOptions, DevOptions, PreviewOptions } from './types.js';

declare global {
  const RSTACK_VERSION: string;
}

export function setupCommands(): void {
  const cli = cac('rs');

  cli.version(RSTACK_VERSION);

  cli.command('dev', 'Start the Rsbuild dev server').action(async (options: DevOptions) => {
    try {
      const rsbuild = await initRsbuild({
        options,
      });

      if (!rsbuild) {
        return;
      }

      await rsbuild.startDevServer();
    } catch (err) {
      logger.error('Failed to start dev server.');
      logger.error(err);
      process.exit(1);
    }
  });

  cli
    .command('build', 'Run Rsbuild to build the app for production')
    .option('-w, --watch', 'Enable watch mode to automatically rebuild on file changes')
    .action(async (options: BuildOptions) => {
      try {
        if (!options.watch) {
          process.env.RSPACK_UNSAFE_FAST_DROP = 'true';
        }

        const rsbuild = await initRsbuild({
          options,
        });

        if (!rsbuild) {
          return;
        }

        const buildResult = await rsbuild.build({
          watch: options.watch,
        });

        if (buildResult) {
          if (options.watch) {
            // TODO
          } else {
            await buildResult.close();
          }
        }
      } catch (err) {
        const RSPACK_BUILD_ERROR = 'Rspack build failed.';
        const isRspackError = err instanceof Error && err.message === RSPACK_BUILD_ERROR;
        if (!isRspackError) {
          logger.error('Failed to build.');
        }

        logger.error(err);
        process.exit(1);
      }
    });

  cli
    .command('preview', 'Preview the production build locally via Rsbuild')
    .action(async (options: PreviewOptions) => {
      try {
        const rsbuild = await initRsbuild({
          options,
        });

        if (!rsbuild) {
          return;
        }

        await rsbuild.preview();
      } catch (err) {
        logger.error('Failed to start preview server.');
        logger.error(err);
        process.exit(1);
      }
    });

  cli.parse();
}
