// cspell:ignore modelcontextprotocol
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { readCodeEvidence, type CodeEvidenceResult } from './codeEvidence.ts';
import { diffContextSnapshots } from './diff.ts';
import { captureLintSnapshot, getLintFixPreview, listDiagnostics } from './lint.ts';
import {
  explainDeadCodeCandidate,
  findUnusedCandidates,
  readProductRoots,
  traceModuleImpact,
} from './queries.ts';
import { validateLintFacet } from './records.ts';
import { analyzeRsdoctorArtifact, listRsdoctorToolNames } from './rsdoctor.ts';
import { resolveRsdoctorReport } from './report.ts';
import { assessSnapshotFreshness } from './source.ts';
import { readProjectStatus } from './status.ts';
import { readContextSnapshots } from './store.ts';
import { captureTestSnapshot, listTestResults, type TestSnapshotRequest } from './testRun.ts';

declare const RSTACK_CONTEXT_VERSION: string;

const renderProjectStatus = (status: Awaited<ReturnType<typeof readProjectStatus>>): string =>
  `Rstack project status: ${status.contexts.length} current context${status.contexts.length === 1 ? '' : 's'} (${status.contexts.filter(({ state }) => state === 'ready').length} ready, ${status.contexts.filter(({ state }) => state === 'pending').length} pending); ${status.issues.length} context-store/read issue${status.issues.length === 1 ? '' : 's'}. See structuredContent for details.`;

const contextIdInput = z.string().min(1).describe('Context ID returned by project_status.');
const rsdoctorDataFileInput = z
  .string()
  .min(1)
  .describe('Checkout-relative path to an explicit Rsdoctor JSON artifact.');
const moduleSelectorInput = z
  .string()
  .min(1)
  .describe('Exact module ID, path, name, or unique path suffix.');
const paginationCursorInput = z
  .string()
  .min(1)
  .describe(
    'Opaque pagination cursor returned by the previous response. Reuse the same filters when continuing.',
  );
const packageRootInput = z
  .string()
  .min(1)
  .describe('Checkout-relative package directory; defaults to the checkout root.');
const configPathInput = z
  .string()
  .min(1)
  .describe('Checkout-relative Rstack config path; defaults to ordinary discovery in packageRoot.');
const rsdoctorToolNameInput = z
  .enum(listRsdoctorToolNames())
  .describe('Supported Rsdoctor catalog tool to run.');

const rsdoctorAnalyzeInput = z
  .object({
    dataFile: rsdoctorDataFileInput,
    input: z.record(z.string(), z.unknown()).optional(),
    toolName: rsdoctorToolNameInput,
  })
  .strict();

const productRootsInput = z
  .object({
    contextId: contextIdInput,
    dataFile: rsdoctorDataFileInput,
    rootLimit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50)
      .describe('Maximum number of representative product roots returned in structuredContent.'),
  })
  .strict();

const unusedCandidatesInput = z
  .object({
    contextId: contextIdInput,
    dataFile: rsdoctorDataFileInput,
    limit: z.number().int().min(1).max(100).optional(),
    cursor: paginationCursorInput.optional(),
  })
  .strict();

const deadCodeExplainInput = z
  .object({
    contextId: contextIdInput,
    dataFile: rsdoctorDataFileInput,
    module: moduleSelectorInput,
    maxDepth: z.number().int().min(1).max(32).optional(),
  })
  .strict();

const moduleImpactInput = z
  .object({
    contextId: contextIdInput,
    dataFile: rsdoctorDataFileInput,
    module: moduleSelectorInput,
    direction: z.enum(['dependencies', 'dependents']).optional(),
    maxDepth: z.number().int().min(1).max(16).optional(),
  })
  .strict();

const codeEvidenceInput = z
  .object({
    path: z.string().min(1).describe('Checkout-relative source path to inspect.'),
    line: z.number().int().min(1).optional(),
    contextId: contextIdInput.optional(),
    dataFile: rsdoctorDataFileInput.optional(),
    module: moduleSelectorInput
      .describe(
        'Optional exact artifact module ID, path, or name to join with path-based test, coverage, and lint evidence.',
      )
      .optional(),
    testSnapshotId: z
      .string()
      .min(1)
      .describe('Explicit completed Rstest snapshot ID; defaults to the newest containing package.')
      .optional(),
    lintSnapshotId: z
      .string()
      .min(1)
      .describe('Explicit completed Rslint snapshot ID; defaults to the newest containing package.')
      .optional(),
    maxDepth: z.number().int().min(1).max(32).optional(),
  })
  .strict();

const reportLinkInput = z.object({ dataFile: rsdoctorDataFileInput }).strict();

const producer = z.enum(['rsbuild', 'rspack', 'rslib', 'rstest', 'rslint', 'rsdoctor']);
const pageLimit = z.number().int().min(1).max(200).default(50);

const snapshotListInput = z
  .object({
    producer: producer.optional(),
    contextId: contextIdInput.optional(),
    limit: pageLimit,
    cursor: paginationCursorInput.optional(),
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
    cursor: paginationCursorInput.optional(),
  })
  .strict();

const testResultsInput = z
  .object({
    snapshotId: z.string().min(1).optional(),
    project: z.string().optional(),
    pathPrefix: z.string().optional(),
    status: z.enum(['skip', 'pass', 'fail', 'todo']).optional(),
    limit: pageLimit,
    cursor: paginationCursorInput.optional(),
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

const lintSnapshotRequestInput = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('files'),
      patterns: z.array(z.string().min(1)).default(['.']),
      includeFixPreview: z.boolean().default(false),
      packageRoot: packageRootInput.optional(),
      configPath: configPathInput.optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal('text'),
      code: z.string(),
      filePath: z.string().min(1),
      includeFixPreview: z.boolean().default(false),
      packageRoot: packageRootInput.optional(),
      configPath: configPathInput.optional(),
    })
    .strict(),
]);

const lintSnapshotInput = z
  .object({
    mode: z
      .enum(['files', 'text'])
      .describe('Lint files selected by patterns, or one text buffer supplied in code.'),
    patterns: z
      .array(z.string().min(1))
      .describe('File patterns used only when mode is files; defaults to ["."].')
      .optional(),
    code: z.string().describe('Source text required when mode is text.').optional(),
    filePath: z
      .string()
      .min(1)
      .describe('Checkout-relative virtual source path required when mode is text.')
      .optional(),
    includeFixPreview: z.boolean().optional(),
    packageRoot: packageRootInput.optional(),
    configPath: configPathInput.optional(),
  })
  .strict();

const testSnapshotInput = z
  .object({
    files: z.array(z.string().min(1)).optional(),
    testNamePattern: z.string().min(1).optional(),
    packageRoot: packageRootInput.optional(),
    configPath: configPathInput.optional(),
    execution: z
      .object({
        include: z.array(z.string()).max(200).optional(),
        exclude: z.array(z.string()).max(200).optional(),
        allowExternal: z.boolean().optional(),
      })
      .strict()
      .describe('Explicitly enable aggregate Istanbul execution coverage for this one test run.')
      .optional(),
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const formatStructuredResult = (result: unknown): string => {
  if (!isRecord(result)) return 'Rstack result is available in structuredContent.';

  const details: string[] = [];
  const addDetail = (key: string, value: unknown): void => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      details.push(`${key}=${String(value)}`);
    }
  };

  addDetail('compatible', result.compatible);
  addDetail('available', result.available);
  addDetail('status', result.status);
  addDetail('classification', result.classification);
  addDetail('total', result.total);
  addDetail('returned', result.returned);
  if (result.returned === undefined && Array.isArray(result.items)) {
    addDetail('returned', result.items.length);
  }
  addDetail('totalVisited', result.totalVisited);

  if (isRecord(result.ownership)) {
    addDetail('project', result.ownership.project);
    addDetail('dependency', result.ownership.dependency);
  }

  if (isRecord(result.graph)) {
    addDetail('moduleCount', result.graph.moduleCount);
    addDetail('edgeCount', result.graph.edgeCount);
  }

  if (isRecord(result.summary)) {
    for (const key of [
      'files',
      'tests',
      'passed',
      'failed',
      'errors',
      'warnings',
      'added',
      'removed',
      'changed',
    ]) {
      addDetail(key, result.summary[key]);
    }
  }

  return details.length === 0
    ? 'Rstack result is available in structuredContent.'
    : `Rstack result: ${details.join(', ')}. See structuredContent for complete data.`;
};

const toStructuredMcpResult = <Result extends object>(result: Result) => ({
  content: [{ type: 'text' as const, text: formatStructuredResult(result) }],
  structuredContent: result,
});

const toProductRootsMcpResult = (
  result: Awaited<ReturnType<typeof readProductRoots>>,
  rootLimit: number,
) => {
  const rootCounts = Object.fromEntries(
    result.product.roots.map(({ kind }) => kind).map((kind) => [kind, 0]),
  ) as Record<string, number>;
  for (const { kind } of result.product.roots) rootCounts[kind] = (rootCounts[kind] ?? 0) + 1;
  const roots = result.product.roots.slice(0, rootLimit);
  const rootSummary = {
    total: result.product.roots.length,
    returned: roots.length,
    truncated: roots.length < result.product.roots.length,
    byKind: rootCounts,
  };
  return {
    content: [
      {
        type: 'text' as const,
        text: `Rstack roots: modules=${result.graph.moduleCount}, edges=${result.graph.edgeCount}, roots=${rootSummary.returned}/${rootSummary.total}. See structuredContent for bounded root details.`,
      },
    ],
    structuredContent: {
      ...result,
      product: { ...result.product, roots },
      rootSummary,
    },
  };
};

const formatCodeEvidence = (result: CodeEvidenceResult): string => {
  const diagnostics = result.diagnostics.truncated
    ? `${result.diagnostics.returned}/${result.diagnostics.total}(truncated)`
    : String(result.diagnostics.returned);
  const module =
    result.module === undefined
      ? 'not-requested'
      : `${result.module.classification}(binding=${result.module.provenance.artifactBinding})`;
  return `Code evidence for ${result.path}: coverage=${result.executionCoverage.state}, test=${result.testOutcome.state}, diagnostics=${diagnostics}, module=${module}. See structuredContent for complete data.`;
};

const isLiteralEmpty = (value: unknown): boolean =>
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (isRecord(value) && Object.keys(value).length === 0);

const isRecursivelyZeroShaped = (value: unknown): boolean => {
  if (value === null || value === '' || value === 0) return true;
  if (Array.isArray(value)) return value.every(isRecursivelyZeroShaped);
  return isRecord(value) && Object.values(value).every(isRecursivelyZeroShaped);
};

const findUnavailableSections = (value: unknown): string[] => {
  if (!isRecord(value) || !Array.isArray(value.sectionEvidence)) return [];
  return value.sectionEvidence
    .flatMap((section) => {
      if (
        !isRecord(section) ||
        typeof section.section !== 'string' ||
        (section.status !== 'omitted' && section.status !== 'unavailable')
      ) {
        return [];
      }
      const reason = typeof section.reason === 'string' ? `: ${section.reason}` : '';
      return [`${section.section} (${section.status}${reason})`];
    })
    .sort();
};

const formatRsdoctorAnalysis = (toolName: string, analysis: unknown, data: unknown): string => {
  const dataState =
    data === null
      ? 'null data'
      : isLiteralEmpty(data)
        ? 'literal empty data'
        : isRecursivelyZeroShaped(data)
          ? 'recursively zero-shaped data'
          : 'data present';
  const unavailableSections = findUnavailableSections(analysis);
  const sectionEvidence =
    unavailableSections.length === 0
      ? ''
      : ` Unavailable sections: ${unavailableSections.join(', ')}.`;
  return `Rsdoctor ${toolName} analysis returned ${dataState}.${sectionEvidence}`;
};

type ContextMcpDependencies = {
  analyzeRsdoctorArtifact?: typeof analyzeRsdoctorArtifact;
  captureLintSnapshot?: typeof captureLintSnapshot;
  captureTestSnapshot?: typeof captureTestSnapshot;
  serverVersion?: string;
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
    selected.map(async ({ run, context, snapshot }) => {
      const lintFacet = validateLintFacet(snapshot.facets.lint);
      return {
        snapshotId: snapshot.snapshotId,
        runId: run.runId,
        producer: run.producer,
        context,
        sequence: snapshot.sequence,
        observedAt: snapshot.observedAt,
        status: snapshot.status,
        completeness: snapshot.completeness,
        ...(lintFacet === undefined
          ? {}
          : {
              metadata: {
                lint: {
                  fixPreviewCaptured: lintFacet.fixPreviewCaptured,
                },
              },
            }),
        freshness: await assessSnapshotFreshness(workspaceRoot, snapshot),
      };
    }),
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
      version: dependencies.serverVersion ?? RSTACK_CONTEXT_VERSION,
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
        'List all recorded checkout-local Rstack contexts and the latest completed build, lint, or test snapshot for each context.',
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
    async ({ contextId, dataFile, rootLimit }) => {
      try {
        const result = await readProductRoots(workspaceRoot, {
          contextId,
          dataFile,
        });
        return toProductRootsMcpResult(result, rootLimit);
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
    async ({ contextId, dataFile, limit, cursor }) => {
      try {
        const result = await findUnusedCandidates(workspaceRoot, {
          contextId,
          dataFile,
          limit,
          cursor,
        });
        return toStructuredMcpResult(result);
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
        return toStructuredMcpResult(result);
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
        return toStructuredMcpResult(result);
      } catch (error) {
        return toMcpError(error);
      }
    },
  );

  server.registerTool(
    'code_evidence',
    {
      title: 'Inspect code evidence',
      description:
        'Join exact-path aggregate execution, test outcome, diagnostics, and optional explicit artifact module evidence without collapsing their bounds.',
      inputSchema: codeEvidenceInput,
      annotations: readOnlyAnnotations,
    },
    async (input) => {
      try {
        const result = await readCodeEvidence(workspaceRoot, input);
        return {
          content: [{ type: 'text', text: formatCodeEvidence(result) }],
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
      description:
        'List completed immutable context snapshots newest-first, optionally filtered by producer or context.',
      inputSchema: snapshotListInput,
      annotations: readOnlyAnnotations,
    },
    async (input) => {
      try {
        const result = await listSnapshots(workspaceRoot, input);
        return toStructuredMcpResult(result);
      } catch (error) {
        return toMcpError(error);
      }
    },
  );

  server.registerTool(
    'diagnostics_list',
    {
      title: 'List snapshot diagnostics',
      description:
        'List deterministic Rslint or Rstest diagnostics, optionally filtered by completed snapshot, producer, path prefix, severity, or rule.',
      inputSchema: diagnosticsListInput,
      annotations: readOnlyAnnotations,
    },
    async (input) => {
      try {
        const result = await listDiagnostics(workspaceRoot, input);
        return toStructuredMcpResult(result);
      } catch (error) {
        return toMcpError(error);
      }
    },
  );

  server.registerTool(
    'test_results',
    {
      title: 'List snapshot test results',
      description:
        'List deterministic test cases, optionally filtered by completed Rstest snapshot, project, path prefix, or status.',
      inputSchema: testResultsInput,
      annotations: readOnlyAnnotations,
    },
    async (input) => {
      try {
        const result = await listTestResults(workspaceRoot, input);
        return toStructuredMcpResult(result);
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
        return toStructuredMcpResult(result);
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
        return toStructuredMcpResult(result);
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
        const request = lintSnapshotRequestInput.parse(input);
        const result = await (dependencies.captureLintSnapshot ?? captureLintSnapshot)(
          workspaceRoot,
          request,
        );
        return toStructuredMcpResult(result);
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
        return toStructuredMcpResult(result);
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
        const analysis = await (dependencies.analyzeRsdoctorArtifact ?? analyzeRsdoctorArtifact)(
          workspaceRoot,
          {
            dataFile,
            input,
            toolName,
          },
        );
        const analysisData =
          typeof analysis.result === 'object' &&
          analysis.result !== null &&
          !Array.isArray(analysis.result) &&
          'data' in analysis.result
            ? analysis.result.data
            : analysis.result;
        return {
          content: [
            {
              type: 'text',
              text: formatRsdoctorAnalysis(analysis.toolName, analysis, analysisData),
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
