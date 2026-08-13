// cspell:ignore modelcontextprotocol
import path from 'node:path';
import { Writable } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  captureLintSnapshot,
  captureTestSnapshot,
  createContextMcpServer,
  resolveContextWorkspace,
} from '@rstackjs/context';
import { withRstackConfigTarget } from './config.ts';

declare const RSTACK_VERSION: string;

const reserveStandardOutputForProtocol = (): Writable => {
  const standardOutput = process.stdout;
  const writeProtocol = standardOutput.write.bind(standardOutput);

  Object.defineProperty(standardOutput, 'write', {
    configurable: true,
    value: process.stderr.write.bind(process.stderr),
    writable: true,
  });

  return new Writable({
    decodeStrings: false,
    write(chunk, encoding, callback) {
      if (writeProtocol(String(chunk), encoding)) callback();
      else standardOutput.once('drain', callback);
    },
  });
};

const runContextMcpServer = async (startPath: string): Promise<void> => {
  const { workspaceRoot } = await resolveContextWorkspace(startPath);
  const server = createContextMcpServer(workspaceRoot, {
    serverVersion: RSTACK_VERSION,
    captureLintSnapshot: (root, request, createRslint) =>
      captureLintSnapshot(root, request, createRslint, {
        wrapperConfigPath: path.join(import.meta.dirname, 'rslintConfig.js'),
        withConfigTarget: withRstackConfigTarget,
      }),
    captureTestSnapshot: (root, request, dependencies = {}) =>
      captureTestSnapshot(root, request, {
        ...dependencies,
        wrapperConfigPath: path.join(import.meta.dirname, 'rstestConfig.js'),
        withConfigTarget: withRstackConfigTarget,
      }),
  });

  await server.connect(new StdioServerTransport(process.stdin, reserveStandardOutputForProtocol()));
};

export { runContextMcpServer };
