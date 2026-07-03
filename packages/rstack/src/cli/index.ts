import { setupCommands } from './commands.js';
import { logger } from '@rsbuild/core';

export async function runCLI(): Promise<void> {
  try {
    await setupCommands();
  } catch (error) {
    logger.error(error);
  }
}
