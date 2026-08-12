// cspell:ignore modelcontextprotocol
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readProjectStatus } from './status.ts';

const renderProjectStatus = (status: Awaited<ReturnType<typeof readProjectStatus>>): string =>
  JSON.stringify(status, null, 2);

const createContextMcpServer = (workspaceRoot: string): McpServer => {
  const server = new McpServer(
    {
      name: 'rstack-context',
      version: '1.0.0',
    },
    {
      instructions:
        'Rstack build-context evidence is read-only, checkout-local, and potentially partial. It includes recorded contexts and their latest completed observations; it is never proof that unobserved code is dead.',
    },
  );

  server.registerTool(
    'project_status',
    {
      title: 'Rstack project status',
      description:
        'Return checkout-local Rstack build contexts and their latest completed observations.',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => {
      const status = await readProjectStatus(workspaceRoot);
      return {
        content: [{ type: 'text', text: renderProjectStatus(status) }],
        structuredContent: status,
      };
    },
  );

  return server;
};

export { createContextMcpServer };
