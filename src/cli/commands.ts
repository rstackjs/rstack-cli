import cac from 'cac';

declare global {
  const RSTACK_VERSION: string;
}

async function runRsbuildCLI(): Promise<void> {
  const args = process.argv.slice(2);
  process.argv = [process.execPath, 'rsbuild', ...args];

  const { runCLI } = await import('@rsbuild/core');
  runCLI();
}

export function setupCommands(): void {
  const cli = cac('rs');
  const { argv } = process;

  cli.version(RSTACK_VERSION);

  cli
    .command('dev [...args]', 'Start the Rsbuild dev server')
    .allowUnknownOptions()
    .action(runRsbuildCLI);

  cli
    .command('build [...args]', 'Run Rsbuild to build the app for production')
    .allowUnknownOptions()
    .option('-w, --watch', 'Enable watch mode to automatically rebuild on file changes')
    .action(runRsbuildCLI);

  cli
    .command('preview [...args]', 'Preview the production build locally via Rsbuild')
    .allowUnknownOptions()
    .action(runRsbuildCLI);

  cli.command('test [...args]', 'Run tests with Rstest').action(async () => {
    const { runCLI } = await import('@rstest/core');
    const args = argv.slice(argv.indexOf('test') + 1);
    process.argv = [process.execPath, 'rstest', ...args];
    runCLI();
  });

  cli.parse();
}
