import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
// cspell:ignore modelcontextprotocol
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
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

test('registers exactly three read-only closed-world context tools', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await withMcpClient(workspaceRoot, async (client) => {
      const { tools } = await client.listTools();

      expect(tools.map((tool) => tool.name)).toEqual([
        'project_status',
        'rsdoctor_analyze',
        'report_link',
      ]);
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

test('analyzes an explicit local Rsdoctor artifact without returning workspace paths', async () => {
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
      expect(JSON.stringify(result.content)).not.toContain(workspaceRoot);
    });
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

test('returns redacted MCP errors for invalid Rsdoctor tool names and paths', async () => {
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
      const absolutePath = await client.callTool({
        name: 'rsdoctor_analyze',
        arguments: {
          dataFile: path.join(workspaceRoot, 'artifacts', 'rsdoctor-data.json'),
          toolName: 'build_summary',
        },
      });

      expect(unknownTool.isError).toBe(true);
      expect(absolutePath.isError).toBe(true);
      expect(JSON.stringify(unknownTool)).not.toContain(workspaceRoot);
      expect(JSON.stringify(absolutePath)).not.toContain(workspaceRoot);
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
