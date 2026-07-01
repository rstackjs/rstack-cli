import { logger } from '@rsbuild/core';
import { setupCommands } from './commands.js';

const { argv } = process;

function initNodeEnv(command: string | undefined) {
  if (process.env.NODE_ENV) {
    return;
  }

  switch (command) {
    case 'build':
    case 'preview':
      process.env.NODE_ENV = 'production';
      break;
    case 'dev':
      process.env.NODE_ENV = 'development';
      break;
    case 'test':
      process.env.NODE_ENV = 'test';
      process.env.RSTEST = 'true';
      break;
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
