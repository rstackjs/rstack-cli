import cac from 'cac';

declare global {
  const RSTACK_VERSION: string;
}

export function setupCommands(): void {
  const cli = cac('rs');

  cli.version(RSTACK_VERSION);
  
  cli.parse();
}
