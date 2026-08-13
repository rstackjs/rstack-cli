import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'rstack/test';
import { analyzeRsdoctorArtifact, listRsdoctorToolNames } from '../../src/context/index.ts';

const validDataFile = 'artifacts/rsdoctor-data.json';

const artifactSectionNames = [
  'errors',
  'configs',
  'summary',
  'resolver',
  'loader',
  'moduleGraph',
  'chunkGraph',
  'moduleCodeMap',
  'plugin',
  'packageGraph',
  'treeShaking',
  'otherReports',
] as const;

const createArtifactMetadata = (
  overrides: Record<string, { status: 'collected' } | { status: 'omitted'; reason: string }> = {},
) => ({
  schemaVersion: 1,
  producer: { name: '@rsdoctor/core', version: '1.2.3' },
  output: { mode: 'normal' },
  build: {
    id: 'test-build',
    root: '/test/project',
    compiler: { name: 'rspack' },
  },
  sections: Object.fromEntries(
    artifactSectionNames.map((name) => [name, overrides[name] ?? { status: 'collected' }]),
  ),
});

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

test('lists the complete pinned Rsdoctor tool names', () => {
  const toolNames = listRsdoctorToolNames();

  expect(toolNames).toEqual([
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
  expect(new Set(toolNames).size).toBe(toolNames.length);
});

test('listing the pinned Rsdoctor tools does not load the adapter package', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const markerFile = path.join(workspaceRoot, 'rsdoctor-loaded');
    const hookFile = path.join(workspaceRoot, 'import-hook.mjs');
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
    const moduleUrl = pathToFileURL(path.resolve('src/context/index.ts')).toString();
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        hookFile,
        '--input-type=module',
        '--eval',
        `const { listRsdoctorToolNames } = await import(${JSON.stringify(moduleUrl)});
listRsdoctorToolNames();`,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, RSTACK_RSDOCTOR_LOADED_MARKER: markerFile },
      },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    await expect(
      import('node:fs/promises').then(({ access }) => access(markerFile)),
    ).rejects.toThrow();
  });
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
      sectionEvidence: [],
      toolName: 'build_summary',
    });
  });
});

test('maps every Rsdoctor catalog tool to its required artifact sections', async () => {
  const cases = [
    ['build_summary', ['summary']],
    ['bundle_optimize', ['chunkGraph', 'errors', 'packageGraph']],
    ['chunks_list', ['chunkGraph']],
    ['errors_list', ['errors']],
    ['packages_direct_dependencies', ['packageGraph']],
    ['packages_duplicates', ['errors']],
    ['packages_similar', ['packageGraph']],
    ['tree_shaking_retained_modules', ['chunkGraph', 'moduleGraph', 'packageGraph']],
    ['tree_shaking_side_effects', ['moduleGraph']],
    ['tree_shaking_summary', ['errors']],
  ] as const;

  await withTempWorkspace(async (workspaceRoot) => {
    for (const [toolName, sections] of cases) {
      const dataFile = `artifacts/${toolName}.json`;
      await writeArtifact(
        workspaceRoot,
        dataFile,
        JSON.stringify({ data: {}, metadata: createArtifactMetadata() }),
      );

      const analysis = await analyzeRsdoctorArtifact(workspaceRoot, {
        dataFile,
        toolName,
      });

      expect(analysis.sectionEvidence).toEqual(
        sections.map((section) => ({ section, status: 'collected' })),
      );
    }
  });
});

test('distinguishes collected empty data from an omitted artifact section', async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const collectedDataFile = 'artifacts/collected.json';
    const omittedDataFile = 'artifacts/omitted.json';
    await writeArtifact(
      workspaceRoot,
      collectedDataFile,
      JSON.stringify({ data: {}, metadata: createArtifactMetadata() }),
    );
    await writeArtifact(
      workspaceRoot,
      omittedDataFile,
      JSON.stringify({
        data: {},
        metadata: createArtifactMetadata({
          summary: { status: 'omitted', reason: 'output-mode' },
        }),
      }),
    );

    const collected = await analyzeRsdoctorArtifact(workspaceRoot, {
      dataFile: collectedDataFile,
      toolName: 'build_summary',
    });
    const omitted = await analyzeRsdoctorArtifact(workspaceRoot, {
      dataFile: omittedDataFile,
      toolName: 'build_summary',
    });

    expect(collected.result).toEqual(omitted.result);
    expect(collected.sectionEvidence).toEqual([{ section: 'summary', status: 'collected' }]);
    expect(omitted.sectionEvidence).toEqual([
      { reason: 'output-mode', section: 'summary', status: 'omitted' },
    ]);
  });
});
