import path from 'node:path';
import { test as baseTest } from 'rstack/test';
import { execCli as baseExecCli, type ExecCli } from './cli.ts';
import { type ExtendedLogHelper, proxyConsole } from './logs.ts';

export type CliTestFixtures = {
  cwd: string;
  execCli: ExecCli;
  logHelper: ExtendedLogHelper;
};

type CliTest = ReturnType<typeof baseTest.extend<CliTestFixtures>>;

function makeBox(title: string) {
  const header = `-------- Logs from: "${title}" --------`;
  const footer = `-------- Logs from: "${title}" --------`;
  return {
    header: `\n${header}\n`,
    footer: `${footer}\n`,
  };
}

export const test: CliTest = baseTest.extend<CliTestFixtures>({
  cwd: async ({ expect }, use) => {
    const { testPath } = expect.getState();

    if (!testPath) {
      throw new Error('Unable to resolve current test file path from expect state.');
    }

    await use(path.dirname(testPath));
  },
  logHelper: [
    async ({ onTestFailed, task }, use) => {
      const logHelper = proxyConsole();

      onTestFailed(() => {
        if (logHelper.logs.length) {
          const { header, footer } = makeBox(task.name);
          logHelper.restore();
          console.log(header);
          logHelper.printCapturedLogs();
          console.log(footer);
        }
      });

      await use(logHelper);
      logHelper.restore();
    },
    { auto: true },
  ],
  execCli: async ({ cwd, logHelper }, use) => {
    const execCli: ExecCli = (command, options = {}) =>
      baseExecCli(command, { ...options, cwd: options.cwd ?? cwd, logHelper });

    await use(execCli);
  },
});
