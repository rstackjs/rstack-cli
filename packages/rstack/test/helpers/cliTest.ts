import { type ChildProcess, type SpawnOptions, spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';
import { test as baseTest } from 'rstack/test';
import { execCli as baseExecCli, type ExecCli, RSTACK_BIN_PATH } from './cli.ts';
import { type ExtendedLogHelper, proxyConsole } from './logs.ts';

type Exec = (
  command: string,
  options?: SpawnOptions,
) => {
  childProcess: ChildProcess;
};

export type CliTestFixtures = {
  cwd: string;
  exec: Exec;
  execCli: ExecCli;
  execCliAsync: Exec;
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

const setupExecOptions = <T extends SpawnOptions>(options: T, cwd: string): T => {
  // inherit process.env from current process
  const { NODE_ENV: _, ...restEnv } = process.env;
  options.env ||= {};
  options.env = { ...restEnv, ...options.env };
  options.cwd ||= cwd;
  return options;
};

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
  exec: async ({ cwd, logHelper }, use) => {
    const closes: Array<() => void> = [];

    const exec: Exec = (command, options = {}) => {
      const childProcess = nodeSpawn(command, setupExecOptions({ shell: true, ...options }, cwd));

      const onData = (data: Buffer) => {
        logHelper.addLog(data.toString());
      };

      childProcess.stdout?.on('data', onData);
      childProcess.stderr?.on('data', onData);

      closes.push(() => {
        childProcess.stdout?.off('data', onData);
        childProcess.stderr?.off('data', onData);
        childProcess.kill();
      });

      return { childProcess };
    };

    try {
      await use(exec);
    } finally {
      for (const close of closes) {
        close();
      }
    }
  },
  execCliAsync: async ({ exec }, use) => {
    const execCliAsync: Exec = (command, options = {}) => {
      return exec(`node "${RSTACK_BIN_PATH}" ${command}`, options);
    };
    await use(execCliAsync);
  },
});
