import { access, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// cspell:ignore modelcontextprotocol
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, test } from 'rstack/test';
import pkgJson from '../../package.json' with { type: 'json' };
import {
  captureLintSnapshot,
  captureTestSnapshot,
  contextStoreSchemaVersion,
  readProjectStatus,
  writeContextRunManifest,
  writeContextSnapshot,
  type ContextDescriptor,
  type ContextRunManifest,
  type ContextSnapshot,
  type LintCaptureResult,
} from '../../src/context/index.ts';
import { createContextMcpServer } from '../../src/context/mcp.ts';
import { getConfigState, loadRstackConfig } from '../../src/config.ts';

const reachabilityFixture = path.resolve(
  import.meta.dirname,
  '../fixtures/context/reachability/application',
);

const withTempWorkspace = async (
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-context-mcp-'));

  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

const withMcpClient = async (
  workspaceRoot: string,
  callback: (client: Client) => Promise<void>,
  dependencies?: Parameters<typeof createContextMcpServer>[1],
): Promise<void> => {
  const server = createContextMcpServer(workspaceRoot, {
    serverVersion: pkgJson.version,
    ...dependencies,
  });
  const client = new Client({ name: 'rstack-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await callback(client);
  } finally {
    await client.close();
    await server.close();
  }
};

const createRun = (runId: string, context: ContextDescriptor): ContextRunManifest => ({
  schemaVersion: contextStoreSchemaVersion,
  runId,
  producer: 'rslib',
  command: 'build',
  startedAt: '2026-08-12T05:00:00.000Z',
  contexts: [context],
});

const writeRsdoctorArtifact = async (workspaceRoot: string): Promise<void> => {
  const dataFile = path.join(workspaceRoot, 'artifacts', 'rsdoctor-data.json');
  await mkdir(path.dirname(dataFile), { recursive: true });
  await writeFile(dataFile, JSON.stringify({ data: { summary: { costs: [{ costs: 12 }] } } }));
};

test('registers the exact ordered fourteen-tool catalog with accurate annotations', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await withMcpClient(workspaceRoot, async (client) => {
      const { tools } = await client.listTools();

      expect(client.getServerVersion()).toEqual({
        name: 'rstack-context',
        version: pkgJson.version,
      });

      expect(tools.map((tool) => tool.name)).toEqual([
        'project_status',
        'product_roots',
        'unused_candidates',
        'dead_code_explain',
        'module_impact',
        'snapshot_list',
        'diagnostics_list',
        'test_results',
        'snapshot_diff',
        'lint_fix_preview',
        'lint_snapshot',
        'test_snapshot',
        'rsdoctor_analyze',
        'report_link',
      ]);
      expect(tools.map((tool) => tool.name)).not.toContain('context_prune');
      expect(tools[0]).toMatchObject({
        name: 'project_status',
        title: 'Rstack context status',
        description:
          'List all recorded checkout-local Rstack contexts and the latest completed build, lint, or test snapshot for each context.',
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      });
      expect(tools.slice(1, 5)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'product_roots',
            inputSchema: expect.objectContaining({
              additionalProperties: false,
              required: ['contextId', 'dataFile'],
            }),
          }),
          expect.objectContaining({
            name: 'unused_candidates',
            inputSchema: expect.objectContaining({
              additionalProperties: false,
              properties: expect.objectContaining({
                cursor: expect.objectContaining({ type: 'string' }),
              }),
              required: ['contextId', 'dataFile'],
            }),
          }),
          expect.objectContaining({
            name: 'dead_code_explain',
            inputSchema: expect.objectContaining({
              additionalProperties: false,
              required: ['contextId', 'dataFile', 'module'],
            }),
          }),
          expect.objectContaining({
            name: 'module_impact',
            inputSchema: expect.objectContaining({
              additionalProperties: false,
              required: ['contextId', 'dataFile', 'module'],
            }),
          }),
        ]),
      );
      for (const tool of tools.slice(1, 5)) {
        expect(tool.annotations).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        });
      }
      for (const tool of tools.slice(5, 10)) {
        expect(tool.annotations).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        });
        expect(tool.inputSchema).toMatchObject({ additionalProperties: false });
      }
      expect(tools[10]?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      });
      expect(tools[10]?.inputSchema).toMatchObject({
        additionalProperties: false,
        required: ['mode'],
        properties: {
          mode: expect.any(Object),
          packageRoot: expect.any(Object),
          configPath: expect.any(Object),
          patterns: expect.any(Object),
          code: expect.any(Object),
          filePath: expect.any(Object),
        },
      });
      expect(tools[11]?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      });
      expect(tools[12]).toMatchObject({
        name: 'rsdoctor_analyze',
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
        inputSchema: {
          additionalProperties: false,
          required: ['dataFile', 'toolName'],
        },
      });
      expect(tools[13]).toMatchObject({
        name: 'report_link',
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
        inputSchema: {
          additionalProperties: false,
          required: ['dataFile'],
        },
      });
    });
  });
});

test('publishes discoverable descriptions for opaque and conditional tool inputs', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await withMcpClient(workspaceRoot, async (client) => {
      const { tools } = await client.listTools();
      const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
      const contextId = {
        description: 'Context ID returned by project_status.',
      };
      const dataFile = {
        description: 'Checkout-relative path to an explicit Rsdoctor JSON artifact.',
      };
      const module = {
        description: 'Exact module ID, path, name, or unique path suffix.',
      };
      const cursor = {
        description:
          'Opaque pagination cursor returned by the previous response. Reuse the same filters when continuing.',
      };

      for (const toolName of [
        'product_roots',
        'unused_candidates',
        'dead_code_explain',
        'module_impact',
      ]) {
        expect(toolByName.get(toolName)?.inputSchema.properties).toMatchObject({
          contextId,
          dataFile,
        });
      }
      for (const toolName of ['rsdoctor_analyze', 'report_link']) {
        expect(toolByName.get(toolName)?.inputSchema.properties).toMatchObject({ dataFile });
      }
      for (const toolName of ['dead_code_explain', 'module_impact']) {
        expect(toolByName.get(toolName)?.inputSchema.properties).toMatchObject({ module });
      }
      for (const toolName of [
        'unused_candidates',
        'snapshot_list',
        'diagnostics_list',
        'test_results',
      ]) {
        expect(toolByName.get(toolName)?.inputSchema.properties).toMatchObject({ cursor });
      }

      expect(toolByName.get('snapshot_list')).toMatchObject({
        description:
          'List completed immutable context snapshots newest-first, optionally filtered by producer or context.',
      });
      expect(toolByName.get('diagnostics_list')).toMatchObject({
        description:
          'List deterministic Rslint or Rstest diagnostics, optionally filtered by completed snapshot, producer, path prefix, severity, or rule.',
      });
      expect(toolByName.get('test_results')).toMatchObject({
        description:
          'List deterministic test cases, optionally filtered by completed Rstest snapshot, project, path prefix, or status.',
      });
      expect(toolByName.get('lint_snapshot')?.inputSchema.properties).toMatchObject({
        mode: {
          description: 'Lint files selected by patterns, or one text buffer supplied in code.',
        },
        patterns: {
          description: 'File patterns used only when mode is files; defaults to ["."].',
        },
        code: {
          description: 'Source text required when mode is text.',
        },
        filePath: {
          description: 'Checkout-relative virtual source path required when mode is text.',
        },
        packageRoot: {
          description: 'Checkout-relative package directory; defaults to the checkout root.',
        },
        configPath: {
          description:
            'Checkout-relative Rstack config path; defaults to ordinary discovery in packageRoot.',
        },
      });
      expect(toolByName.get('test_snapshot')?.inputSchema.properties).toMatchObject({
        packageRoot: {
          description: 'Checkout-relative package directory; defaults to the checkout root.',
        },
        configPath: {
          description:
            'Checkout-relative Rstack config path; defaults to ordinary discovery in packageRoot.',
        },
      });
      expect(toolByName.get('rsdoctor_analyze')?.inputSchema.properties).toMatchObject({
        toolName: {
          description: 'Supported Rsdoctor catalog tool to run.',
          enum: [
            'build_summary',
            'bundle_optimize',
            'chunks_list',
            'errors_list',
            'packages_direct_dependencies',
            'packages_duplicates',
            'packages_similar',
            'tree_shaking_retained_modules',
            'tree_shaking_side_effects',
            'tree_shaking_summary',
          ],
        },
      });
    });
  });
});

test('returns structured results for each artifact-scoped module tool', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await cp(reachabilityFixture, workspaceRoot, { recursive: true });
    const context = {
      contextId: 'ctx_app',
      packageRoot: '.',
      product: 'application',
    } as const;
    expect(
      await writeContextRunManifest(workspaceRoot, createRun('run_app', context)),
    ).toMatchObject({ written: true });

    await withMcpClient(workspaceRoot, async (client) => {
      const productRoots = await client.callTool({
        name: 'product_roots',
        arguments: {
          contextId: context.contextId,
          dataFile: 'rsdoctor-data.json',
        },
      });
      expect(productRoots.isError).not.toBe(true);
      expect(productRoots.content).toEqual([
        {
          type: 'text',
          text: 'Rstack result: moduleCount=8, edgeCount=4. See structuredContent for complete data.',
        },
      ]);
      expect(productRoots.structuredContent).toMatchObject({
        provenance: {
          contextId: context.contextId,
          dataFile: 'rsdoctor-data.json',
          artifactBinding: 'explicit-unverified',
        },
        graph: { moduleCount: 8, edgeCount: 4 },
      });

      const candidates = await client.callTool({
        name: 'unused_candidates',
        arguments: {
          contextId: context.contextId,
          dataFile: 'rsdoctor-data.json',
          limit: 1,
        },
      });
      expect(candidates.isError).not.toBe(true);
      expect(candidates.content).toEqual([
        {
          type: 'text',
          text: 'Rstack result: total=1, returned=1. See structuredContent for complete data.',
        },
      ]);
      expect(candidates.structuredContent).toMatchObject({
        total: 1,
        returned: 1,
        candidates: [
          {
            classification: 'unreachable-module-candidate',
            subject: { kind: 'module', id: '3', path: 'src/legacy.ts' },
          },
        ],
      });

      const explanation = await client.callTool({
        name: 'dead_code_explain',
        arguments: {
          contextId: context.contextId,
          dataFile: 'rsdoctor-data.json',
          module: 'src/legacy.ts',
          maxDepth: 8,
        },
      });
      expect(explanation.isError).not.toBe(true);
      expect(explanation.content).toEqual([
        {
          type: 'text',
          text: 'Rstack result: classification=unreachable-module-candidate. See structuredContent for complete data.',
        },
      ]);
      expect(explanation.structuredContent).toMatchObject({
        classification: 'unreachable-module-candidate',
        subject: { kind: 'module', id: '3', path: 'src/legacy.ts' },
      });

      const impact = await client.callTool({
        name: 'module_impact',
        arguments: {
          contextId: context.contextId,
          dataFile: 'rsdoctor-data.json',
          module: 'src/live.ts',
          direction: 'dependents',
          maxDepth: 8,
        },
      });
      expect(impact.isError).not.toBe(true);
      expect(impact.content).toEqual([
        {
          type: 'text',
          text: 'Rstack result: returned=2, totalVisited=2. See structuredContent for complete data.',
        },
      ]);
      expect(impact.structuredContent).toMatchObject({
        direction: 'dependents',
        subject: { kind: 'module', id: '2', path: 'src/live.ts' },
        affectedChunks: ['10', 'shared'],
      });
    });
  });
});

test('continues unused candidates with an opaque cursor', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await cp(reachabilityFixture, workspaceRoot, { recursive: true });
    const context = {
      contextId: 'ctx_app',
      packageRoot: '.',
      product: 'application',
    } as const;
    expect(
      await writeContextRunManifest(workspaceRoot, createRun('run_app', context)),
    ).toMatchObject({ written: true });
    await writeFile(
      path.join(workspaceRoot, 'rsdoctor-data.json'),
      JSON.stringify({
        data: {
          moduleGraph: {
            modules: [
              { id: 1, path: 'src/index.ts', name: 'index', isEntry: true },
              { id: 2, path: 'src/unused-a.ts', name: 'unused-a' },
              { id: 3, path: 'src/unused-b.ts', name: 'unused-b' },
            ],
            dependencies: [],
          },
        },
      }),
    );

    await withMcpClient(workspaceRoot, async (client) => {
      const firstPage = await client.callTool({
        name: 'unused_candidates',
        arguments: {
          contextId: context.contextId,
          dataFile: 'rsdoctor-data.json',
          limit: 1,
        },
      });
      expect(firstPage.isError).not.toBe(true);
      expect(firstPage.structuredContent).toMatchObject({
        total: 2,
        returned: 1,
        resultTruncated: true,
        candidates: [{ subject: { id: '2' } }],
        nextCursor: expect.any(String),
      });

      const nextCursor = (firstPage.structuredContent as { nextCursor: string }).nextCursor;
      const secondPage = await client.callTool({
        name: 'unused_candidates',
        arguments: {
          contextId: context.contextId,
          dataFile: 'rsdoctor-data.json',
          limit: 1,
          cursor: nextCursor,
        },
      });
      expect(secondPage.isError).not.toBe(true);
      expect(secondPage.structuredContent).toMatchObject({
        total: 2,
        returned: 1,
        resultTruncated: false,
        candidates: [{ subject: { id: '3' } }],
      });
      expect(secondPage.structuredContent).not.toHaveProperty('nextCursor');

      const invalidCursor = await client.callTool({
        name: 'unused_candidates',
        arguments: {
          contextId: context.contextId,
          dataFile: 'rsdoctor-data.json',
          cursor: 'not-a-cursor',
        },
      });
      expect(invalidCursor.isError).toBe(true);
      expect(invalidCursor.content).toEqual([
        { type: 'text', text: 'Invalid unused candidates cursor.' },
      ]);
    });
  });
});

test('analyzes an explicit Rsdoctor artifact', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeRsdoctorArtifact(workspaceRoot);

    await withMcpClient(workspaceRoot, async (client) => {
      const result = await client.callTool({
        name: 'rsdoctor_analyze',
        arguments: {
          dataFile: 'artifacts/rsdoctor-data.json',
          toolName: 'build_summary',
        },
      });

      expect(result.structuredContent).toEqual({
        dataFile: 'artifacts/rsdoctor-data.json',
        result: {
          data: { costs: [{ costs: 12 }], totalCost: 12 },
          description: 'Get build summary with costs (build time analysis).',
          ok: true,
        },
        sectionEvidence: [],
        toolName: 'build_summary',
      });
      expect(result.content).toEqual([
        {
          type: 'text',
          text: 'Rsdoctor build_summary analysis returned data present.',
        },
      ]);
    });
  });
});

test('reports a null Rsdoctor analysis without claiming data is available', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await withMcpClient(
      workspaceRoot,
      async (client) => {
        const result = await client.callTool({
          name: 'rsdoctor_analyze',
          arguments: {
            dataFile: 'artifacts/rsdoctor-data.json',
            toolName: 'build_summary',
          },
        });

        expect(result.content).toEqual([
          {
            type: 'text',
            text: 'Rsdoctor build_summary analysis returned null data.',
          },
        ]);
        expect(result.structuredContent).toEqual({
          dataFile: 'artifacts/rsdoctor-data.json',
          result: { data: null, description: 'No build summary.', ok: true },
          sectionEvidence: [],
          toolName: 'build_summary',
        });
      },
      {
        analyzeRsdoctorArtifact: async (_workspaceRoot, request) => ({
          dataFile: request.dataFile,
          result: { data: null, description: 'No build summary.', ok: true },
          sectionEvidence: [],
          toolName: request.toolName,
        }),
      },
    );
  });
});

test('distinguishes literal and recursively zero-shaped Rsdoctor analysis data', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const cases = [
      {
        data: [],
        expected: 'Rsdoctor build_summary analysis returned literal empty data.',
      },
      {
        data: { costs: [], nested: { cached: null, modules: [] }, totalCost: 0 },
        expected: 'Rsdoctor build_summary analysis returned recursively zero-shaped data.',
      },
    ];
    for (const { data, expected } of cases) {
      await withMcpClient(
        workspaceRoot,
        async (client) => {
          const result = await client.callTool({
            name: 'rsdoctor_analyze',
            arguments: {
              dataFile: 'artifacts/rsdoctor-data.json',
              toolName: 'build_summary',
            },
          });

          expect(result.content).toEqual([{ type: 'text', text: expected }]);
        },
        {
          analyzeRsdoctorArtifact: async (_workspaceRoot, request) => ({
            dataFile: request.dataFile,
            result: { data, description: 'Build summary.', ok: true },
            sectionEvidence: [],
            toolName: request.toolName,
          }),
        },
      );
    }
  });
});

test('reports omitted Rsdoctor section evidence when the analysis provides it', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await withMcpClient(
      workspaceRoot,
      async (client) => {
        const result = await client.callTool({
          name: 'rsdoctor_analyze',
          arguments: {
            dataFile: 'artifacts/rsdoctor-data.json',
            toolName: 'build_summary',
          },
        });

        expect(result.content).toEqual([
          {
            type: 'text',
            text: 'Rsdoctor build_summary analysis returned recursively zero-shaped data. Unavailable sections: moduleGraph (omitted: not-selected).',
          },
        ]);
      },
      {
        analyzeRsdoctorArtifact: async (_workspaceRoot, request) => ({
          dataFile: request.dataFile,
          result: {
            data: { costs: [], totalCost: 0 },
            description: 'Build summary.',
            ok: true,
          },
          sectionEvidence: [
            {
              section: 'moduleGraph',
              status: 'omitted' as const,
              reason: 'not-selected' as const,
            },
          ],
          toolName: request.toolName,
        }),
      },
    );
  });
});

test('loads Rsdoctor only when a built MCP process receives an analysis request', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const markerFile = path.join(workspaceRoot, 'rsdoctor-loaded');
    const hookFile = path.join(workspaceRoot, 'import-hook.mjs');
    await writeFile(path.join(workspaceRoot, 'package.json'), '{"name":"mcp-startup-test"}');
    await writeRsdoctorArtifact(workspaceRoot);
    await writeFile(
      hookFile,
      `import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@rsdoctor/agent-cli') {
      writeFileSync(process.env.RSTACK_RSDOCTOR_LOADED_MARKER, 'loaded');
    }
    return nextResolve(specifier, context);
  },
});
`,
    );

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve('bin/rs.js'), 'mcp'],
      cwd: workspaceRoot,
      env: {
        ...getDefaultEnvironment(),
        NODE_OPTIONS: `--import=${hookFile}`,
        RSTACK_RSDOCTOR_LOADED_MARKER: markerFile,
      },
      stderr: 'pipe',
    });
    const client = new Client({
      name: 'rstack-built-process-test',
      version: '1.0.0',
    });

    try {
      await client.connect(transport);
      await client.callTool({ name: 'project_status', arguments: {} });
      await expect(access(markerFile)).rejects.toThrow();

      const result = await client.callTool({
        name: 'rsdoctor_analyze',
        arguments: {
          dataFile: 'artifacts/rsdoctor-data.json',
          toolName: 'build_summary',
        },
      });

      expect(result.isError).not.toBe(true);
      await expect(access(markerFile)).resolves.toBeUndefined();
    } finally {
      await client.close();
    }
  });
});

test('returns a contained report resource link only for an existing report', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeRsdoctorArtifact(workspaceRoot);
    const reportPath = path.join(workspaceRoot, 'artifacts', 'report-rsdoctor.html');
    await writeFile(reportPath, '<html></html>');

    await withMcpClient(workspaceRoot, async (client) => {
      const result = await client.callTool({
        name: 'report_link',
        arguments: { dataFile: 'artifacts/rsdoctor-data.json' },
      });

      expect(result.structuredContent).toEqual({
        dataFile: 'artifacts/rsdoctor-data.json',
        report: {
          kind: 'html',
          path: 'artifacts/report-rsdoctor.html',
          uri: `file://${reportPath}`,
        },
      });
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'resource_link',
            name: 'Rsdoctor HTML report',
            uri: `file://${reportPath}`,
          }),
        ]),
      );
    });
  });
});

test('returns a portable Rsdoctor analysis next action when no GUI report exists', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeRsdoctorArtifact(workspaceRoot);

    await withMcpClient(workspaceRoot, async (client) => {
      const result = await client.callTool({
        name: 'report_link',
        arguments: { dataFile: 'artifacts/rsdoctor-data.json' },
      });

      expect(result.structuredContent).toEqual({
        dataFile: 'artifacts/rsdoctor-data.json',
        nextAction: {
          arguments: {
            dataFile: 'artifacts/rsdoctor-data.json',
            input: {},
            toolName: 'build_summary',
          },
          tool: 'rsdoctor_analyze',
        },
        reason:
          'No GUI report was found; a GUI report is optional. Use rsdoctor_analyze for static inspection.',
      });
      expect(result.content).toEqual([
        {
          type: 'text',
          text: 'No GUI report was found; a GUI report is optional. Use rsdoctor_analyze for static inspection.',
        },
      ]);
      expect(JSON.stringify(result)).not.toContain(workspaceRoot);
      expect(JSON.stringify(result)).not.toContain('pnpm');
    });
  });
});

test('rejects an invalid Rsdoctor tool name at the MCP schema boundary', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeRsdoctorArtifact(workspaceRoot);

    await withMcpClient(workspaceRoot, async (client) => {
      const unknownTool = await client.callTool({
        name: 'rsdoctor_analyze',
        arguments: {
          dataFile: 'artifacts/rsdoctor-data.json',
          toolName: 'unknown_tool',
        },
      });
      expect(unknownTool.isError).toBe(true);
      expect(unknownTool.content).toEqual([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Invalid arguments for tool rsdoctor_analyze'),
        }),
      ]);
    });
  });
});

test('returns ordinary MCP errors for invalid module-analysis selections', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await cp(reachabilityFixture, workspaceRoot, { recursive: true });
    const context = {
      contextId: 'ctx_app',
      packageRoot: '.',
      product: 'application',
    } as const;
    expect(
      await writeContextRunManifest(workspaceRoot, createRun('run_app', context)),
    ).toMatchObject({ written: true });

    await withMcpClient(workspaceRoot, async (client) => {
      const unknownContext = await client.callTool({
        name: 'product_roots',
        arguments: { contextId: 'ctx_missing', dataFile: 'rsdoctor-data.json' },
      });
      expect(unknownContext.isError).toBe(true);
      expect(unknownContext.content).toEqual([
        { type: 'text', text: 'Unknown context: ctx_missing' },
      ]);

      const unknownModule = await client.callTool({
        name: 'dead_code_explain',
        arguments: {
          contextId: context.contextId,
          dataFile: 'rsdoctor-data.json',
          module: 'src/missing.ts',
        },
      });
      expect(unknownModule.isError).toBe(true);
      expect(unknownModule.content).toEqual([
        { type: 'text', text: 'Unknown module selector: src/missing.ts' },
      ]);
    });
  });
});

test('rejects unexpected fields at every strict module-analysis input boundary', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await withMcpClient(workspaceRoot, async (client) => {
      const calls = [
        {
          name: 'product_roots',
          arguments: {
            contextId: 'ctx_app',
            dataFile: 'artifact.json',
            unexpected: true,
          },
        },
        {
          name: 'unused_candidates',
          arguments: {
            contextId: 'ctx_app',
            dataFile: 'artifact.json',
            unexpected: true,
          },
        },
        {
          name: 'dead_code_explain',
          arguments: {
            contextId: 'ctx_app',
            dataFile: 'artifact.json',
            module: 'src/index.ts',
            unexpected: true,
          },
        },
        {
          name: 'module_impact',
          arguments: {
            contextId: 'ctx_app',
            dataFile: 'artifact.json',
            module: 'src/index.ts',
            unexpected: true,
          },
        },
      ];

      for (const call of calls) {
        const result = await client.callTool(call);
        expect(result.isError).toBe(true);
      }
    });
  });
});

test('rejects unexpected fields at the strict Rsdoctor MCP input boundary', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeRsdoctorArtifact(workspaceRoot);

    await withMcpClient(workspaceRoot, async (client) => {
      const result = await client.callTool({
        name: 'rsdoctor_analyze',
        arguments: {
          dataFile: 'artifacts/rsdoctor-data.json',
          toolName: 'build_summary',
          unexpected: true,
        },
      });

      expect(result.isError).toBe(true);
    });
  });
});

test('reads the current store for every project status call without workspace paths', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const context = {
      contextId: 'ctx_library',
      packageRoot: 'packages/library',
      product: 'library',
      environment: 'esm',
    } as const;
    const run = createRun('run_library', context);
    const snapshot = {
      schemaVersion: contextStoreSchemaVersion,
      snapshotId: 'snap_library',
      runId: run.runId,
      contextId: context.contextId,
      sequence: 1,
      observedAt: '2026-08-12T05:00:01.000Z',
      status: 'pass',
      completeness: { build: 'complete' },
      facets: { summary: { errors: 0 } },
    } satisfies ContextSnapshot;

    await mkdir(path.join(workspaceRoot, 'packages', 'library'), {
      recursive: true,
    });
    expect(await writeContextRunManifest(workspaceRoot, run)).toMatchObject({
      written: true,
    });

    await withMcpClient(workspaceRoot, async (client) => {
      const firstResult = await client.callTool({
        name: 'project_status',
        arguments: {},
      });

      expect(firstResult.structuredContent).toEqual({
        schemaVersion: contextStoreSchemaVersion,
        workspaceId: expect.stringMatching(/^ws_[0-9a-f]{24}$/u),
        contexts: [
          {
            runId: run.runId,
            producer: run.producer,
            context,
            state: 'pending',
          },
        ],
        issues: [],
      });
      expect(firstResult.content).toEqual([
        {
          type: 'text',
          text: 'Rstack project status: 1 current context (0 ready, 1 pending); 0 context-store/read issues. See structuredContent for details.',
        },
      ]);

      expect(await writeContextSnapshot(workspaceRoot, snapshot)).toMatchObject({ written: true });

      const secondResult = await client.callTool({
        name: 'project_status',
        arguments: {},
      });

      expect(secondResult.structuredContent).toEqual({
        schemaVersion: contextStoreSchemaVersion,
        workspaceId: expect.stringMatching(/^ws_[0-9a-f]{24}$/u),
        contexts: [
          {
            runId: run.runId,
            producer: run.producer,
            context,
            state: 'ready',
            latestSnapshot: snapshot,
            freshness: { state: 'unknown', changedPaths: [] },
          },
        ],
        issues: [],
      });
      expect(secondResult.content).toEqual([
        {
          type: 'text',
          text: 'Rstack project status: 1 current context (1 ready, 0 pending); 0 context-store/read issues. See structuredContent for details.',
        },
      ]);
    });
  });
});

test('returns a valid empty project status', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await withMcpClient(workspaceRoot, async (client) => {
      const result = await client.callTool({
        name: 'project_status',
        arguments: {},
      });

      expect(result.structuredContent).toEqual({
        schemaVersion: contextStoreSchemaVersion,
        workspaceId: expect.stringMatching(/^ws_[0-9a-f]{24}$/u),
        contexts: [],
        issues: [],
      });
      expect(result.content).toEqual([
        {
          type: 'text',
          text: 'Rstack project status: 0 current contexts (0 ready, 0 pending); 0 context-store/read issues. See structuredContent for details.',
        },
      ]);
    });
  });
});

test('queries immutable lint and test snapshots with paging, diffs, and previews', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const lintContext = {
      contextId: 'ctx_lint',
      packageRoot: '.',
      product: 'development',
      environment: 'lint',
    } as const;
    const lintRun = {
      ...createRun('run_lint', lintContext),
      producer: 'rslint',
      command: 'lint',
    } satisfies ContextRunManifest;
    const lintSnapshot = {
      schemaVersion: contextStoreSchemaVersion,
      snapshotId: 'snap_lint',
      runId: lintRun.runId,
      contextId: lintContext.contextId,
      sequence: 0,
      observedAt: '2026-08-12T06:00:00.000Z',
      status: 'fail',
      completeness: { lint: 'complete' },
      facets: {
        lint: {
          producer: 'rslint',
          mode: 'files',
          fixPreviewCaptured: false,
          files: [
            {
              path: 'src/index.ts',
              digest: 'a'.repeat(64),
              errorCount: 1,
              warningCount: 0,
              fixableErrorCount: 1,
              fixableWarningCount: 0,
              messages: [
                {
                  ruleId: 'no-debugger',
                  severity: 2,
                  message: 'Unexpected debugger statement.',
                  line: 3,
                  column: 1,
                  fix: { range: [10, 18], text: '' },
                },
              ],
            },
          ],
          totals: {
            files: 1,
            errors: 1,
            warnings: 0,
            fixableErrors: 1,
            fixableWarnings: 0,
          },
        },
      },
    } satisfies ContextSnapshot;
    const testContext = {
      contextId: 'ctx_test',
      packageRoot: '.',
      product: 'development',
      environment: 'test',
    } as const;
    const testRun = {
      ...createRun('run_test', testContext),
      producer: 'rstest',
      command: 'test',
    } satisfies ContextRunManifest;
    const testSnapshot = {
      schemaVersion: contextStoreSchemaVersion,
      snapshotId: 'snap_test',
      runId: testRun.runId,
      contextId: testContext.contextId,
      sequence: 0,
      observedAt: '2026-08-12T07:00:00.000Z',
      status: 'pass',
      completeness: { test: 'complete' },
      facets: {
        test: {
          producer: 'rstest',
          files: [
            {
              project: 'unit',
              path: 'src/index.test.ts',
              status: 'pass',
              tests: [
                {
                  project: 'unit',
                  path: 'src/index.test.ts',
                  name: 'works',
                  status: 'pass',
                },
              ],
            },
          ],
          stats: {
            tests: { total: 1, passed: 1, failed: 0, skipped: 0, todo: 0 },
            files: { total: 1, failed: 0 },
          },
          durationMs: 5,
          unhandledErrors: [],
        },
      },
    } satisfies ContextSnapshot;

    for (const [run, snapshot] of [
      [lintRun, lintSnapshot],
      [testRun, testSnapshot],
    ] as const) {
      expect(await writeContextRunManifest(workspaceRoot, run)).toMatchObject({
        written: true,
      });
      expect(await writeContextSnapshot(workspaceRoot, snapshot)).toMatchObject({ written: true });
    }

    await withMcpClient(workspaceRoot, async (client) => {
      const snapshots = await client.callTool({
        name: 'snapshot_list',
        arguments: { limit: 1 },
      });
      expect(snapshots.isError).not.toBe(true);
      expect(snapshots.content).toEqual([
        {
          type: 'text',
          text: 'Rstack result: total=2, returned=1. See structuredContent for complete data.',
        },
      ]);
      expect(snapshots.structuredContent).toMatchObject({
        total: 2,
        items: [{ snapshotId: 'snap_test', producer: 'rstest' }],
        nextCursor: expect.any(String),
      });
      const nextSnapshots = await client.callTool({
        name: 'snapshot_list',
        arguments: {
          limit: 1,
          cursor: (snapshots.structuredContent as { nextCursor: string }).nextCursor,
        },
      });
      expect(nextSnapshots.structuredContent).toMatchObject({
        total: 2,
        items: [
          {
            snapshotId: 'snap_lint',
            producer: 'rslint',
            metadata: { lint: { fixPreviewCaptured: false } },
          },
        ],
      });
      expect(nextSnapshots.structuredContent).not.toHaveProperty('nextCursor');

      const diagnostics = await client.callTool({
        name: 'diagnostics_list',
        arguments: { snapshotId: lintSnapshot.snapshotId, severity: 'error' },
      });
      expect(diagnostics.isError).not.toBe(true);
      expect(diagnostics.content).toEqual([
        {
          type: 'text',
          text: 'Rstack result: total=1, returned=1. See structuredContent for complete data.',
        },
      ]);
      expect(diagnostics.structuredContent).toMatchObject({
        snapshotId: lintSnapshot.snapshotId,
        total: 1,
        items: [{ producer: 'rslint', path: 'src/index.ts', ruleId: 'no-debugger' }],
      });

      const results = await client.callTool({
        name: 'test_results',
        arguments: { snapshotId: testSnapshot.snapshotId, status: 'pass' },
      });
      expect(results.isError).not.toBe(true);
      expect(results.content).toEqual([
        {
          type: 'text',
          text: 'Rstack result: total=1, returned=1. See structuredContent for complete data.',
        },
      ]);
      expect(results.structuredContent).toMatchObject({
        snapshotId: testSnapshot.snapshotId,
        total: 1,
        items: [{ project: 'unit', path: 'src/index.test.ts', name: 'works' }],
      });

      const incompatible = await client.callTool({
        name: 'snapshot_diff',
        arguments: {
          leftSnapshotId: lintSnapshot.snapshotId,
          rightSnapshotId: testSnapshot.snapshotId,
          kind: 'diagnostics',
        },
      });
      expect(incompatible.isError).not.toBe(true);
      expect(incompatible.content).toEqual([
        {
          type: 'text',
          text: 'Rstack result: compatible=false. See structuredContent for complete data.',
        },
      ]);
      expect(incompatible.structuredContent).toEqual({
        compatible: false,
        reasons: ['context', 'facet', 'producer'],
      });

      const preview = await client.callTool({
        name: 'lint_fix_preview',
        arguments: {
          snapshotId: lintSnapshot.snapshotId,
          path: 'src/index.ts',
        },
      });
      expect(preview.isError).not.toBe(true);
      expect(preview.content).toEqual([
        {
          type: 'text',
          text: 'Rstack result: available=false. See structuredContent for complete data.',
        },
      ]);
      expect(preview.structuredContent).toEqual({
        available: false,
        reason: 'not-captured',
        snapshotId: lintSnapshot.snapshotId,
        path: 'src/index.ts',
      });
    });
  });
});

test('runs explicit captures through injected producers and returns ordinary MCP errors', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const lintResult = {
      runId: 'run_lint',
      contextId: 'ctx_lint',
      snapshotId: 'snap_lint',
      status: 'pass',
      freshness: { state: 'fresh', changedPaths: [] },
      summary: {
        files: 1,
        errors: 0,
        warnings: 0,
        fixableErrors: 0,
        fixableWarnings: 0,
      },
    } satisfies LintCaptureResult;
    const captureRequests: unknown[] = [];

    await withMcpClient(
      workspaceRoot,
      async (client) => {
        const lint = await client.callTool({
          name: 'lint_snapshot',
          arguments: {
            mode: 'files',
            packageRoot: 'packages/library',
            configPath: 'packages/library/rstack.config.ts',
          },
        });
        expect(lint.structuredContent).toEqual(lintResult);
        expect(lint.content).toEqual([
          {
            type: 'text',
            text: 'Rstack result: status=pass, files=1, errors=0, warnings=0. See structuredContent for complete data.',
          },
        ]);
        expect(captureRequests).toEqual([
          {
            mode: 'files',
            patterns: ['.'],
            includeFixPreview: false,
            packageRoot: 'packages/library',
            configPath: 'packages/library/rstack.config.ts',
          },
        ]);
        const lintText = await client.callTool({
          name: 'lint_snapshot',
          arguments: {
            mode: 'text',
            code: 'export {};\n',
            filePath: 'src/index.ts',
            packageRoot: 'packages/app',
            configPath: 'packages/app/rstack.config.ts',
          },
        });
        expect(lintText.structuredContent).toEqual(lintResult);
        expect(captureRequests[1]).toEqual({
          mode: 'text',
          code: 'export {};\n',
          filePath: 'src/index.ts',
          includeFixPreview: false,
          packageRoot: 'packages/app',
          configPath: 'packages/app/rstack.config.ts',
        });
        const incompleteLintText = await client.callTool({
          name: 'lint_snapshot',
          arguments: { mode: 'text', filePath: 'src/index.ts' },
        });
        expect(incompleteLintText.isError).toBe(true);
        expect(captureRequests).toHaveLength(2);

        const testResult = await client.callTool({
          name: 'test_snapshot',
          arguments: { files: ['src/index.test.ts'] },
        });
        expect(testResult.isError).toBe(true);
        expect(testResult.content).toEqual([{ type: 'text', text: 'Test capture failed.' }]);
      },
      {
        captureLintSnapshot: async (_root, request) => {
          captureRequests.push(request);
          return lintResult;
        },
        captureTestSnapshot: async () => {
          throw new Error('Test capture failed.');
        },
      },
    );
  });
});

test('captures independent monorepo package contexts through one root MCP', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const packageRoots = ['packages/app', 'packages/library'] as const;
    const configPaths = [
      'packages/app/rstack.config.ts',
      'packages/library/custom.config.ts',
    ] as const;

    for (const [index, packageRoot] of packageRoots.entries()) {
      const absolutePackageRoot = path.join(workspaceRoot, packageRoot);
      await mkdir(path.join(absolutePackageRoot, 'src'), { recursive: true });
      await writeFile(
        path.join(absolutePackageRoot, 'package.json'),
        JSON.stringify({
          name: index === 0 ? '@repo/app' : '@repo/library',
          type: 'module',
        }),
      );
      await writeFile(path.join(workspaceRoot, configPaths[index]), 'export default {};\n');
      await writeFile(path.join(absolutePackageRoot, 'src/index.ts'), 'export {};\n');
    }
    const packageWithoutConfig = path.join(workspaceRoot, 'packages/no-config');
    await mkdir(path.join(packageWithoutConfig, 'src'), { recursive: true });
    await writeFile(
      path.join(packageWithoutConfig, 'package.json'),
      JSON.stringify({ name: '@repo/no-config' }),
    );
    await writeFile(path.join(packageWithoutConfig, 'src/index.ts'), 'export {};\n');

    const lintCalls: unknown[] = [];
    const testCalls: unknown[] = [];
    const state = getConfigState();
    const originalConfigPath = state.configPath;
    const originalConfigRoot = state.configRoot;
    state.configPath = 'root.config.ts';
    state.configRoot = workspaceRoot;
    let testSequence = 0;

    try {
      await withMcpClient(
        workspaceRoot,
        async (client) => {
          const selections = packageRoots.map((packageRoot, index) => ({
            packageRoot,
            ...(index === 0 ? {} : { configPath: configPaths[index] }),
          }));
          await Promise.all(
            selections.map(async (selection) => {
              const lint = await client.callTool({
                name: 'lint_snapshot',
                arguments: { mode: 'files', ...selection },
              });
              expect(lint.isError).not.toBe(true);
            }),
          );
          await Promise.all(
            selections.map(async (selection) => {
              const testResult = await client.callTool({
                name: 'test_snapshot',
                arguments: selection,
              });
              expect(testResult.isError).not.toBe(true);
            }),
          );
          const lintWithoutConfig = await client.callTool({
            name: 'lint_snapshot',
            arguments: { mode: 'files', packageRoot: 'packages/no-config' },
          });
          expect(lintWithoutConfig.isError).not.toBe(true);
          const testWithoutConfig = await client.callTool({
            name: 'test_snapshot',
            arguments: { packageRoot: 'packages/no-config' },
          });
          expect(testWithoutConfig.isError).not.toBe(true);

          const status = await readProjectStatus(workspaceRoot);
          expect(status.contexts).toHaveLength(6);
          expect(status.contexts.map(({ context }) => context)).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                packageRoot: 'packages/app',
                packageName: '@repo/app',
                configPath: 'packages/app/rstack.config.ts',
              }),
              expect.objectContaining({
                packageRoot: 'packages/library',
                packageName: '@repo/library',
                configPath: 'packages/library/custom.config.ts',
              }),
              expect.objectContaining({
                packageRoot: 'packages/no-config',
                packageName: '@repo/no-config',
              }),
            ]),
          );
          expect(
            status.contexts
              .filter(({ context }) => context.packageRoot === 'packages/no-config')
              .every(({ context }) => context.configPath === undefined),
          ).toBe(true);
          expect(new Set(status.contexts.map(({ context }) => context.contextId)).size).toBe(6);
        },
        {
          captureLintSnapshot: (root, request) =>
            captureLintSnapshot(root, request, (options) => ({
              lintFiles: async () => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                lintCalls.push({
                  cwd: options.cwd,
                  configPath: getConfigState().configPath,
                  loadedConfigPath: (await loadRstackConfig()).filePath,
                });
                return [
                  {
                    filePath: path.join(options.cwd!, 'src/index.ts'),
                    errorCount: 0,
                    warningCount: 0,
                    fixableErrorCount: 0,
                    fixableWarningCount: 0,
                    messages: [],
                  },
                ];
              },
              lintText: async () => [],
              close: async () => {},
            })),
          captureTestSnapshot: (root, request) => {
            testSequence += 1;
            const sequence = testSequence;
            return captureTestSnapshot(root, request, {
              runRstest: async (options) => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                testCalls.push({
                  cwd: options?.cwd,
                  configPath: getConfigState().configPath,
                  loadedConfigPath: (await loadRstackConfig()).filePath,
                });
                return {
                  ok: true,
                  files: [],
                  stats: {
                    tests: {
                      total: 0,
                      passed: 0,
                      failed: 0,
                      skipped: 0,
                      todo: 0,
                    },
                    files: { total: 0, failed: 0 },
                  },
                  unhandledErrors: [],
                  duration: { total: 0 },
                };
              },
              createRunId: () => `run_test_${sequence}`,
              createSnapshotId: () => `snap_test_${sequence}`,
            });
          },
        },
      );

      const expectedCalls = [
        {
          cwd: path.join(workspaceRoot, 'packages/app'),
          configPath: path.join(workspaceRoot, 'packages/app/rstack.config.ts'),
          loadedConfigPath: path.join(workspaceRoot, 'packages/app/rstack.config.ts'),
        },
        {
          cwd: path.join(workspaceRoot, 'packages/library'),
          configPath: path.join(workspaceRoot, 'packages/library/custom.config.ts'),
          loadedConfigPath: path.join(workspaceRoot, 'packages/library/custom.config.ts'),
        },
        {
          cwd: path.join(workspaceRoot, 'packages/no-config'),
          configPath: undefined,
          loadedConfigPath: null,
        },
      ];
      expect(lintCalls).toHaveLength(expectedCalls.length);
      expect(lintCalls).toEqual(expect.arrayContaining(expectedCalls));
      expect(testCalls).toHaveLength(expectedCalls.length);
      expect(testCalls).toEqual(expect.arrayContaining(expectedCalls));
      expect(state.configPath).toBe('root.config.ts');
      expect(state.configRoot).toBe(workspaceRoot);
    } finally {
      state.configPath = originalConfigPath;
      state.configRoot = originalConfigRoot;
    }
  });
});

test('loads distinct package lint and test configs through the built root MCP', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const rstackEntry = pathToFileURL(path.resolve('dist/index.js')).href;
    const packages = [
      {
        root: 'packages/app',
        configPath: 'packages/app/rstack.config.ts',
        lintRule: 'error',
        testStatus: 'pass',
      },
      {
        root: 'packages/library',
        configPath: 'packages/library/custom.config.ts',
        lintRule: 'off',
        testStatus: 'fail',
      },
    ] as const;

    for (const fixture of packages) {
      const packageRoot = path.join(workspaceRoot, fixture.root);
      await mkdir(path.join(packageRoot, 'src'), { recursive: true });
      await writeFile(
        path.join(packageRoot, 'package.json'),
        JSON.stringify({
          name: `@repo/${path.basename(packageRoot)}`,
          type: 'module',
        }),
      );
      await writeFile(path.join(packageRoot, 'src/index.ts'), 'debugger;\n');
      await writeFile(
        path.join(workspaceRoot, fixture.configPath),
        `import { define } from ${JSON.stringify(rstackEntry)};
define.lint([{ files: ['src/**/*.ts'], rules: { 'no-debugger': '${fixture.lintRule}' } }]);
define.test({ include: ['./tests/*.never.ts'], passWithNoTests: ${fixture.testStatus === 'pass'} });
`,
      );
    }

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve('bin/rs.js'), 'mcp'],
      cwd: workspaceRoot,
      env: getDefaultEnvironment(),
      stderr: 'pipe',
    });
    const client = new Client({
      name: 'rstack-package-config-test',
      version: '1.0.0',
    });

    try {
      await client.connect(transport);
      expect(client.getServerVersion()).toEqual({
        name: 'rstack-context',
        version: pkgJson.version,
      });
      const lintResults = await Promise.all(
        packages.map((fixture) =>
          client.callTool({
            name: 'lint_snapshot',
            arguments: {
              mode: 'files',
              patterns: ['src/index.ts'],
              packageRoot: fixture.root,
              ...(fixture.root === 'packages/app' ? {} : { configPath: fixture.configPath }),
            },
          }),
        ),
      );
      const testResults = await Promise.all(
        packages.map((fixture) =>
          client.callTool({
            name: 'test_snapshot',
            arguments: {
              packageRoot: fixture.root,
              ...(fixture.root === 'packages/app' ? {} : { configPath: fixture.configPath }),
            },
          }),
        ),
      );

      for (const result of [...lintResults, ...testResults]) {
        expect(result.isError).not.toBe(true);
      }

      expect(lintResults.map((result) => result.structuredContent)).toEqual([
        expect.objectContaining({
          status: 'fail',
          summary: expect.objectContaining({ errors: 1 }),
        }),
        expect.objectContaining({
          status: 'pass',
          summary: expect.objectContaining({ errors: 0 }),
        }),
      ]);
      expect(testResults.map((result) => result.structuredContent)).toEqual([
        expect.objectContaining({
          status: 'pass',
          summary: expect.objectContaining({ files: 0, tests: 0 }),
        }),
        expect.objectContaining({
          status: 'fail',
          summary: expect.objectContaining({ files: 0, tests: 0 }),
        }),
      ]);
    } finally {
      await client.close();
    }
  });
});

test('rejects unexpected fields at every Phase 3/4 MCP input boundary', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await withMcpClient(workspaceRoot, async (client) => {
      for (const [name, arguments_] of [
        ['snapshot_list', { unexpected: true }],
        ['diagnostics_list', { unexpected: true }],
        ['test_results', { unexpected: true }],
        [
          'snapshot_diff',
          {
            leftSnapshotId: 'left',
            rightSnapshotId: 'right',
            unexpected: true,
          },
        ],
        ['lint_fix_preview', { snapshotId: 'snap', path: 'src/a.ts', unexpected: true }],
        ['lint_snapshot', { mode: 'files', unexpected: true }],
        ['test_snapshot', { unexpected: true }],
      ] as const) {
        const result = await client.callTool({ name, arguments: arguments_ });
        expect(result.isError).toBe(true);
      }
    });
  });
});
