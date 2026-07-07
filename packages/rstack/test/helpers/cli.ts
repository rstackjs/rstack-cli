import { type ExecSyncOptions, execSync } from 'node:child_process';
import path from 'node:path';

const RSTACK_BIN_PATH = path.join(import.meta.dirname, '../../bin/rs.js');

export type ExecCli = (command: string, options?: ExecSyncOptions) => string;

export const execCli: ExecCli = (command, options = {}) => {
  const output = execSync(`${RSTACK_BIN_PATH} ${command}`, {
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  });

  return output.toString();
};
