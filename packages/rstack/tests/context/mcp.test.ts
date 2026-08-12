import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
// cspell:ignore modelcontextprotocol
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, test } from 'rstack/test';
import {
  contextStoreSchemaVersion,
  writeContextRunManifest,
  writeContextSnapshot,
  type ContextDescriptor,
  type ContextRunManifest,
  type ContextSnapshot,
} from '../../src/context/index.ts';
import { createContextMcpServer } from '../../src/context/mcp.ts';

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
): Promise<void> => {
  const server = createContextMcpServer(workspaceRoot);
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

test('registers exactly the three read-only Phase 1 tools', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await withMcpClient(workspaceRoot, async (client) => {
      const { tools } = await client.listTools();

      expect(tools.map((tool) => tool.name)).toEqual([
        'project_status',
        'rsdoctor_analyze',
        'report_link',
      ]);
      expect(tools.map((tool) => tool.name)).not.toContain('context_prune');
      expect(tools[0]).toMatchObject({
        name: 'project_status',
        title: 'Rstack project status',
        description:
          'Return checkout-local Rstack build contexts and their latest completed observations.',
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      });
      expect(tools[1]).toMatchObject({
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
      expect(tools[2]).toMatchObject({
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
        toolName: 'build_summary',
      });
    });
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

test('returns an MCP error for an invalid Rsdoctor tool name', async () => {
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
      expect(unknownTool.content).toEqual([{ type: 'text', text: 'Unknown Rsdoctor tool.' }]);
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

      expect(firstResult.structuredContent).toMatchObject({
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

      expect(await writeContextSnapshot(workspaceRoot, snapshot)).toMatchObject({ written: true });

      const secondResult = await client.callTool({
        name: 'project_status',
        arguments: {},
      });

      expect(secondResult.structuredContent).toMatchObject({
        contexts: [
          {
            runId: run.runId,
            state: 'ready',
            latestSnapshot: snapshot,
          },
        ],
      });
      expect(JSON.stringify(secondResult.content)).not.toContain(workspaceRoot);
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
      expect(JSON.stringify(result.content)).not.toContain(workspaceRoot);
    });
  });
});
