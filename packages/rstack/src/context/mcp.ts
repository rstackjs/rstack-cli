// cspell:ignore modelcontextprotocol
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { diffContextSnapshots } from './diff.ts';
import {
  captureLintSnapshot,
  getLintFixPreview,
  listDiagnostics,
  type LintSnapshotRequest,
} from './lint.ts';
import {
  explainDeadCodeCandidate,
  findUnusedCandidates,
  readProductRoots,
  traceModuleImpact,
} from './queries.ts';
import { analyzeRsdoctorArtifact } from './rsdoctor.ts';
import { resolveRsdoctorReport } from './report.ts';
import { assessSnapshotFreshness } from './source.ts';
import { readProjectStatus } from './status.ts';
import { readContextSnapshots } from './store.ts';
import { captureTestSnapshot, listTestResults, type TestSnapshotRequest } from './testRun.ts';

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

const producer = z.enum(['rsbuild', 'rspack', 'rslib', 'rstest', 'rslint', 'rsdoctor']);
const pageLimit = z.number().int().min(1).max(200).default(50);

const snapshotListInput = z
  .object({
    producer: producer.optional(),
    contextId: z.string().min(1).optional(),
    limit: pageLimit,
    cursor: z.string().min(1).optional(),
  })
  .strict();

const diagnosticsListInput = z
  .object({
    snapshotId: z.string().min(1).optional(),
    producer: z.enum(['rslint', 'rstest']).optional(),
    pathPrefix: z.string().optional(),
    severity: z.enum(['error', 'warning']).optional(),
    ruleId: z.string().optional(),
    limit: pageLimit,
    cursor: z.string().min(1).optional(),
  })
  .strict();

const testResultsInput = z
  .object({
    snapshotId: z.string().min(1).optional(),
    project: z.string().optional(),
    pathPrefix: z.string().optional(),
    status: z.enum(['skip', 'pass', 'fail', 'todo']).optional(),
    limit: pageLimit,
    cursor: z.string().min(1).optional(),
  })
  .strict();

const snapshotDiffInput = z
  .object({
    leftSnapshotId: z.string().min(1),
    rightSnapshotId: z.string().min(1),
    kind: z.enum(['diagnostics', 'tests']).optional(),
  })
  .strict();

const lintFixPreviewInput = z
  .object({ snapshotId: z.string().min(1), path: z.string().min(1) })
  .strict();

const lintSnapshotInput = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('files'),
      patterns: z.array(z.string().min(1)).default(['.']),
      includeFixPreview: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      mode: z.literal('text'),
      code: z.string(),
      filePath: z.string().min(1),
      includeFixPreview: z.boolean().default(false),
    })
    .strict(),
]);

const testSnapshotInput = z
  .object({
    files: z.array(z.string().min(1)).optional(),
    testNamePattern: z.string().min(1).optional(),
  })
  .strict();

const toMcpError = (error: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: error instanceof Error ? error.message : 'Rstack context request failed.',
    },
  ],
  isError: true,
});

type ContextMcpDependencies = {
  captureLintSnapshot?: typeof captureLintSnapshot;
  captureTestSnapshot?: typeof captureTestSnapshot;
};

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const decodeSnapshotCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) return 0;
  const value = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^(?:0|[1-9]\d*)$/u.test(value) || Buffer.from(value).toString('base64url') !== cursor) {
    throw new Error('Invalid snapshot cursor.');
  }
  return Number(value);
};

const listSnapshots = async (workspaceRoot: string, input: z.infer<typeof snapshotListInput>) => {
  const snapshots = await readContextSnapshots(workspaceRoot, {
    producer: input.producer,
    contextId: input.contextId,
  });
  const offset = decodeSnapshotCursor(input.cursor);
  const selected = snapshots.slice(offset, offset + input.limit);
  const items = await Promise.all(
    selected.map(async ({ run, context, snapshot }) => ({
      snapshotId: snapshot.snapshotId,
      runId: run.runId,
      producer: run.producer,
      context,
      sequence: snapshot.sequence,
      observedAt: snapshot.observedAt,
      status: snapshot.status,
      completeness: snapshot.completeness,
      freshness: await assessSnapshotFreshness(workspaceRoot, snapshot),
    })),
  );
  const nextOffset = offset + items.length;
  return {
    total: snapshots.length,
    items,
    ...(nextOffset < snapshots.length
      ? { nextCursor: Buffer.from(String(nextOffset)).toString('base64url') }
      : {}),
  };
};

const createContextMcpServer = (
  workspaceRoot: string,
  dependencies: ContextMcpDependencies = {},
): McpServer => {
  const server = new McpServer(
    {
      name: 'rstack-context',
      version: '1.0.0',
    },
    {
      instructions:
        'Rstack context evidence is checkout-local and potentially partial. Query tools read completed observations; lint_snapshot and test_snapshot explicitly execute their producer. Artifact-scoped module candidates are never proof that unobserved code is dead.',
    },
  );

  server.registerTool(
    'project_status',
    {
      title: 'Rstack context status',
      description:
        'Return all recorded checkout-local Rstack contexts and their latest completed snapshots.',
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
    'snapshot_list',
    {
      title: 'List context snapshots',
      description: 'List completed immutable context snapshots with producer-specific freshness.',
      inputSchema: snapshotListInput,
      annotations: readOnlyAnnotations,
    },
    async (input) => {
      try {
        const result = await listSnapshots(workspaceRoot, input);
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
    'diagnostics_list',
    {
      title: 'List snapshot diagnostics',
      description: 'List deterministic Rslint or Rstest diagnostics from one completed snapshot.',
      inputSchema: diagnosticsListInput,
      annotations: readOnlyAnnotations,
    },
    async (input) => {
      try {
        const result = await listDiagnostics(workspaceRoot, input);
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
    'test_results',
    {
      title: 'List snapshot test results',
      description: 'List deterministic test cases from one completed Rstest snapshot.',
      inputSchema: testResultsInput,
      annotations: readOnlyAnnotations,
    },
    async (input) => {
      try {
        const result = await listTestResults(workspaceRoot, input);
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
    'snapshot_diff',
    {
      title: 'Compare context snapshots',
      description: 'Compare diagnostics or tests from two compatible immutable snapshots.',
      inputSchema: snapshotDiffInput,
      annotations: readOnlyAnnotations,
    },
    async (input) => {
      try {
        const result = await diffContextSnapshots(workspaceRoot, input);
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
    'lint_fix_preview',
    {
      title: 'Read lint fix preview',
      description: 'Return a fixed-output preview already stored in an immutable lint snapshot.',
      inputSchema: lintFixPreviewInput,
      annotations: readOnlyAnnotations,
    },
    async ({ snapshotId, path: filePath }) => {
      try {
        const result = await getLintFixPreview(workspaceRoot, snapshotId, filePath);
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
    'lint_snapshot',
    {
      title: 'Capture lint snapshot',
      description: 'Run one explicit Rslint capture and store its immutable results.',
      inputSchema: lintSnapshotInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const result = await (dependencies.captureLintSnapshot ?? captureLintSnapshot)(
          workspaceRoot,
          input as LintSnapshotRequest,
        );
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
    'test_snapshot',
    {
      title: 'Capture test snapshot',
      description: 'Run one explicit one-shot Rstest capture and store its immutable results.',
      inputSchema: testSnapshotInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const result = await (dependencies.captureTestSnapshot ?? captureTestSnapshot)(
          workspaceRoot,
          input as TestSnapshotRequest,
        );
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
export type { ContextMcpDependencies };
