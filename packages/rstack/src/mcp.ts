// cspell:ignore modelcontextprotocol
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  captureLintSnapshot,
  captureTestSnapshot,
  createContextMcpServer,
  resolveContextWorkspace,
} from '@rstackjs/context';
import { withRstackConfigTarget } from './config.ts';

declare const RSTACK_VERSION: string;

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

  await server.connect(new StdioServerTransport());
};

export { runContextMcpServer };
