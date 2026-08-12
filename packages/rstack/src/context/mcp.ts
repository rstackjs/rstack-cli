// cspell:ignore modelcontextprotocol
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  explainDeadCodeCandidate,
  findUnusedCandidates,
  readProductRoots,
  traceModuleImpact,
} from './queries.ts';
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

const productRootsInput = z
  .object({
    contextId: z.string().min(1),
    dataFile: z.string().min(1),
  })
  .strict();

const unusedCandidatesInput = z
  .object({
    contextId: z.string().min(1),
    dataFile: z.string().min(1),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const deadCodeExplainInput = z
  .object({
    contextId: z.string().min(1),
    dataFile: z.string().min(1),
    module: z.string().min(1),
    maxDepth: z.number().int().min(1).max(16).optional(),
  })
  .strict();

const moduleImpactInput = z
  .object({
    contextId: z.string().min(1),
    dataFile: z.string().min(1),
    module: z.string().min(1),
    direction: z.enum(['dependencies', 'dependents']).optional(),
    maxDepth: z.number().int().min(1).max(16).optional(),
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
    'product_roots',
    {
      title: 'Resolve product roots',
      description: 'Return selected roots for one explicit Rsdoctor module graph.',
      inputSchema: productRootsInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ contextId, dataFile }) => {
      try {
        const result = await readProductRoots(workspaceRoot, {
          contextId,
          dataFile,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        return toMcpError(error);
      }
    },
  );

  server.registerTool(
    'unused_candidates',
    {
      title: 'Find unused module candidates',
      description:
        'Return unreachable module candidates from one explicit Rsdoctor artifact graph.',
      inputSchema: unusedCandidatesInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ contextId, dataFile, limit }) => {
      try {
        const result = await findUnusedCandidates(workspaceRoot, {
          contextId,
          dataFile,
          limit,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        return toMcpError(error);
      }
    },
  );

  server.registerTool(
    'dead_code_explain',
    {
      title: 'Explain module reachability',
      description:
        'Explain why one module is reachable, conservatively preserved, or an artifact-scoped candidate.',
      inputSchema: deadCodeExplainInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ contextId, dataFile, module, maxDepth }) => {
      try {
        const result = await explainDeadCodeCandidate(workspaceRoot, {
          contextId,
          dataFile,
          module,
          maxDepth,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        return toMcpError(error);
      }
    },
  );

  server.registerTool(
    'module_impact',
    {
      title: 'Trace module impact',
      description:
        'Trace bounded module dependencies or dependents within one explicit artifact graph.',
      inputSchema: moduleImpactInput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ contextId, dataFile, module, direction, maxDepth }) => {
      try {
        const result = await traceModuleImpact(workspaceRoot, {
          contextId,
          dataFile,
          module,
          direction,
          maxDepth,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        return toMcpError(error);
      }
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
