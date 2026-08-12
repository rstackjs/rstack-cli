// cspell:ignore modelcontextprotocol
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createContextMcpServer } from './context/mcp.ts';
import { resolveContextWorkspace } from './context/workspace.ts';

const runContextMcpServer = async (startPath: string): Promise<void> => {
  const { workspaceRoot } = await resolveContextWorkspace(startPath);
  const server = createContextMcpServer(workspaceRoot);

  await server.connect(new StdioServerTransport());
};

export { runContextMcpServer };
