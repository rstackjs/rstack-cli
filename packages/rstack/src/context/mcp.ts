// cspell:ignore modelcontextprotocol
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { analyzeRsdoctorArtifact } from './rsdoctor.ts';
import { resolveRsdoctorReport } from './report.ts';
import { readProjectStatus } from './status.ts';

const renderProjectStatus = (status: Awaited<ReturnType<typeof readProjectStatus>>): string =>
  JSON.stringify(status, null, 2);

const rsdoctorAnalyzeInput = z
  .object({
    dataFile: z.string().min(1),
    input: z.record(z.string(), z.unknown()).optional(),
    toolName: z.string().min(1),
  })
  .strict();

const reportLinkInput = z.object({ dataFile: z.string().min(1) }).strict();

const toMcpError = (error: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: error instanceof Error ? error.message : 'Rsdoctor request failed.',
    },
  ],
  isError: true,
});

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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      const status = await readProjectStatus(workspaceRoot);
      return {
        content: [{ type: 'text', text: renderProjectStatus(status) }],
        structuredContent: status,
      };
    },
  );

  server.registerTool(
    'rsdoctor_analyze',
    {
      title: 'Analyze Rsdoctor artifact',
      description: 'Analyze an explicit Rsdoctor artifact with a catalog tool.',
      inputSchema: rsdoctorAnalyzeInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ dataFile, input, toolName }) => {
      try {
        const analysis = await analyzeRsdoctorArtifact(workspaceRoot, {
          dataFile,
          input,
          toolName,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Rsdoctor ${analysis.toolName} analysis is available.`,
            },
          ],
          structuredContent: analysis,
        };
      } catch (error) {
        return toMcpError(error);
      }
    },
  );

  server.registerTool(
    'report_link',
    {
      title: 'Link Rsdoctor report',
      description:
        'Return a link to an explicit checkout-local Rsdoctor report artifact when present.',
      inputSchema: reportLinkInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ dataFile }) => {
      try {
        const report = await resolveRsdoctorReport(workspaceRoot, dataFile);
        const content: ContentBlock[] = [
          {
            type: 'text' as const,
            text: 'report' in report ? 'Rsdoctor report link is available.' : report.reason,
          },
        ];

        if ('report' in report) {
          content.push({
            type: 'resource_link' as const,
            mimeType: report.report.kind === 'html' ? 'text/html' : 'application/json',
            name: `Rsdoctor ${report.report.kind === 'html' ? 'HTML report' : 'manifest'}`,
            uri: report.report.uri,
          });
        }

        return { content, structuredContent: report };
      } catch (error) {
        return toMcpError(error);
      }
    },
  );

  return server;
};

export { createContextMcpServer };
