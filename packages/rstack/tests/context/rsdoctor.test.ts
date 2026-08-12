import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'rstack/test';
import { analyzeRsdoctorArtifact, listRsdoctorTools } from '../../src/context/index.ts';

const validDataFile = 'artifacts/rsdoctor-data.json';

const withTempWorkspace = async (
  callback: (workspaceRoot: string) => Promise<void>,
): Promise<void> => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'rstack-rsdoctor-'));

  try {
    await callback(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
};

const writeArtifact = async (
  workspaceRoot: string,
  dataFile: string,
  contents: string,
): Promise<void> => {
  const artifactPath = path.join(workspaceRoot, dataFile);
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, contents);
};

test('lists the complete pinned Rsdoctor tool catalog as sorted unique descriptors', async () => {
  const tools = await listRsdoctorTools();

  expect(tools.map((tool) => tool.name)).toEqual([
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
  ]);
  expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);

  for (const tool of tools) {
    expect(tool.inputSchema).toBeTypeOf('object');
    expect(tool.inputSchema).not.toBeNull();
    expect(Array.isArray(tool.inputSchema)).toBe(false);
  }
});

test('rejects a missing Rsdoctor artifact', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'build_summary',
      }),
    ).rejects.toThrow('could not be read');
  });
});

test('rejects malformed Rsdoctor artifact JSON', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(workspaceRoot, validDataFile, '{not-json');

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'build_summary',
      }),
    ).rejects.toThrow('valid JSON');
  });
});

test('rejects a Rsdoctor artifact missing its data envelope', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(workspaceRoot, validDataFile, '{}');

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'build_summary',
      }),
    ).rejects.toThrow('object data field');
  });
});

test('rejects a Rsdoctor artifact whose data envelope is not an object', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(workspaceRoot, validDataFile, '{"data":[]}');

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'build_summary',
      }),
    ).rejects.toThrow('object data field');
  });
});

test('rejects an unknown Rsdoctor tool name', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(workspaceRoot, validDataFile, '{"data":{}}');

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'not_a_real_tool',
      }),
    ).rejects.toThrow('Unknown Rsdoctor tool');
  });
});

test('rejects input that does not match the selected tool schema', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(workspaceRoot, validDataFile, '{"data":{}}');

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        input: { page: 0 },
        toolName: 'build_summary',
      }),
    ).rejects.toThrow('does not match its schema');
  });
});

test('runs a real Rsdoctor catalog tool against a valid artifact fixture', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    await writeArtifact(
      workspaceRoot,
      validDataFile,
      JSON.stringify({ data: { summary: { costs: [{ costs: 12 }] } } }),
    );

    await expect(
      analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile: validDataFile,
        toolName: 'build_summary',
      }),
    ).resolves.toEqual({
      dataFile: validDataFile,
      result: {
        data: { costs: [{ costs: 12 }], totalCost: 12 },
        description: 'Get build summary with costs (build time analysis).',
        ok: true,
      },
      toolName: 'build_summary',
    });
  });
});

test('returns real Rsdoctor strings and fields without redaction', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const source = 'function privateSource() {}';
    const token = 'API_TOKEN=visible-token';
    const absolutePath = path.join(workspaceRoot, 'private', 'source.ts');
    await writeArtifact(
      workspaceRoot,
      validDataFile,
      JSON.stringify({
        data: {
          errors: [
            {
              category: 'visible-category',
              code: 'E_VISIBLE',
              description: `Compile failed at ${absolutePath}; ${token}`,
              error: {
                configuration: { mode: 'visible-mode' },
                environment: { NODE_ENV: 'visible-environment' },
                source,
              },
              id: absolutePath,
              level: 'error',
              link: 'https://example.test/visible',
              packages: ['visible-package'],
              stack: 'visible stack',
              title: 'visible title',
              type: 'visible-type',
            },
          ],
        },
      }),
    );

    const analysis = await analyzeRsdoctorArtifact(workspaceRoot, {
      dataFile: validDataFile,
      toolName: 'errors_list',
    });
    const serialized = JSON.stringify(analysis.result);

    expect(serialized).toContain(absolutePath);
    expect(serialized).toContain(token);
    expect(serialized).toContain('configuration');
    expect(serialized).toContain('visible-mode');
    expect(serialized).toContain('environment');
    expect(serialized).toContain('visible-environment');
    expect(serialized).toContain(source);
    expect(serialized).not.toContain('<redacted');
  });
});
