import path from 'node:path';
import { test as baseTest } from 'rstack/test';
import { execCli as baseExecCli, type ExecCli } from './cli.ts';

export type CliTestFixtures = {
  cwd: string;
  execCli: ExecCli;
};

type CliTest = ReturnType<typeof baseTest.extend<CliTestFixtures>>;

export const test: CliTest = baseTest.extend<CliTestFixtures>({
  cwd: async ({ expect }, use) => {
    const { testPath } = expect.getState();

    if (!testPath) {
      throw new Error('Unable to resolve current test file path from expect state.');
    }

    await use(path.dirname(testPath));
  },
  execCli: async ({ cwd }, use) => {
    const execCli: ExecCli = (command, options = {}) =>
      baseExecCli(command, { ...options, cwd: options.cwd ?? cwd });

    await use(execCli);
  },
});
