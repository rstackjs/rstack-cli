import { type ExecSyncOptions, execSync } from 'node:child_process';
import path from 'node:path';
import type { LogHelper } from './logs.ts';

const RSTACK_BIN_PATH = path.join(import.meta.dirname, '../../bin/rs.js');

export type ExecCliOptions = ExecSyncOptions & {
  logHelper?: LogHelper;
};

export type ExecCli = (command: string, options?: ExecCliOptions) => string;

type ExecCliError = Error & {
  stdout?: Buffer | string;
  stderr?: Buffer | string;
};

const addLog = (logHelper: LogHelper | undefined, output: Buffer | string | undefined) => {
  if (output) {
    logHelper?.addLog(output.toString());
  }
};

export const execCli: ExecCli = (command, options = {}) => {
  const { logHelper, ...execOptions } = options;

  try {
    const output = execSync(`${RSTACK_BIN_PATH} ${command}`, {
      stdio: 'pipe',
      ...execOptions,
      env: {
        ...process.env,
        ...execOptions.env,
      },
    });

    addLog(logHelper, output);
    return output.toString();
  } catch (error) {
    const execCliError = error as ExecCliError;
    addLog(logHelper, execCliError.stdout);
    addLog(logHelper, execCliError.stderr);
    throw error;
  }
};
