import { type ExecFileSyncOptions, execFileSync } from 'node:child_process';
import path from 'node:path';

const RSTACK_BIN_PATH = path.join(import.meta.dirname, '../../bin/rs.js');

export const execCli = (args: string[], options: ExecFileSyncOptions = {}): string => {
  const output = execFileSync(process.execPath, [RSTACK_BIN_PATH, ...args], {
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  });

  return output.toString();
};
