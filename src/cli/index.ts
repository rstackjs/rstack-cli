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

function showGreeting() {
  // Ensure consistent spacing before the greeting message.
  // Different package managers handle output formatting differently - some automatically
  // add a blank line before command output, while others do not.
  const { npm_execpath, npm_lifecycle_event, NODE_RUN_SCRIPT_NAME } = process.env;
  const isNpx = npm_lifecycle_event === 'npx';
  const isBun = npm_execpath?.includes('.bun');
  const isNodeRun = Boolean(NODE_RUN_SCRIPT_NAME);
  const prefix = isNpx || isBun || isNodeRun ? '\n' : '';
  logger.greet(`${prefix}Rstack v${RSTACK_VERSION}\n`);
}

export function runCLI(): void {
  const command = argv[2];

  initNodeEnv(command);
  showGreeting();

  try {
    setupCommands();
  } catch (err) {
    logger.error('Failed to start Rstack CLI.');
    logger.error(err);
    process.exit(1);
  }
}
