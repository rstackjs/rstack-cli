import { setupCommands } from './commands.ts';
import { logger } from 'rslog';

export async function runCLI(): Promise<void> {
  try {
    await setupCommands();
  } catch (error) {
    logger.error(error);
    process.exitCode = 1;
  }
}
