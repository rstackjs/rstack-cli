// cspell:ignore modelcontextprotocol
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { analyzeRsdoctorArtifact } from './rsdoctor.ts';
import { resolveRsdoctorReport } from './report.ts';
import { applyContextRetention, planContextRetention } from './retention.ts';
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

const contextPruneInput = z
  .object({
    dryRun: z.boolean().optional(),
    policy: z
      .object({
        maxAgeMs: z.number().int().nonnegative().optional(),
        maxBytes: z.number().int().nonnegative().optional(),
        maxRuns: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const toMcpError = () => ({
  content: [{ type: 'text' as const, text: 'Rsdoctor request failed.' }],
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
      description: 'Analyze an explicit checkout-local Rsdoctor artifact with a catalog tool.',
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
      } catch {
        return toMcpError();
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
      } catch {
        return toMcpError();
      }
    },
  );

  server.registerTool(
    'context_prune',
    {
      title: 'Prune retained context runs',
      description:
        'Plan bounded checkout-local context retention; dryRun defaults to true and dryRun:false may delete selected immutable runs.',
      inputSchema: contextPruneInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
    },
    async ({ dryRun = true, policy }) => {
      try {
        const plan = await planContextRetention(workspaceRoot, policy);
        if (dryRun) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Context retention plan generated; no files were deleted.',
              },
            ],
            structuredContent: { dryRun: true, plan },
          };
        }
        const result = await applyContextRetention(workspaceRoot, plan);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Context retention applied; deleted ${result.deleted.length} run(s) and skipped ${result.skipped.length}.`,
            },
          ],
          structuredContent: { dryRun: false, plan, result },
        };
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Context retention request failed.',
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
};

export { createContextMcpServer };
