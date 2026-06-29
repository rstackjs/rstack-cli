import { logger } from '@rsbuild/core';
import { setupCommands } from './commands.js';

const { argv } = process;

function initNodeEnv(command: string | undefined) {
  if (!process.env.NODE_ENV) {
    if (command === 'build' || command === 'preview') {
      process.env.NODE_ENV = 'production';
    } else if (command === 'dev') {
      process.env.NODE_ENV = 'development';
    }
  }
}

export function runCLI(): void {
  const command = argv[2];

  initNodeEnv(command);

  try {
    setupCommands();
  } catch (err) {
    logger.error('Failed to start Rstack CLI.');
    logger.error(err);
    process.exit(1);
  }
}
